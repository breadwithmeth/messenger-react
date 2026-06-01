import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/shared/ui/Layout/Layout';
import { Input } from '@/shared/ui/Input/Input';
import { Button } from '@/shared/ui/Button/Button';
import { useAuth } from '@/auth/useAuth';
import { emitToast } from '@/shared/utils/toast';
import { NetworkError } from '@/shared/api/types';
import { organizationPhonesApi } from '@/features/organization-phones/api/organizationPhonesApi';
import type { OrganizationPhone } from '@/features/organization-phones/model/types';
import { wabaApi } from '@/features/waba/api/wabaApi';
import type { BroadcastTemplateResponse, WabaTemplateComponent, WabaTemplateListItem } from '@/features/waba/model/types';
import styles from './MassOperationsPage.module.css';

const mapActionError = (error: unknown, fallback: string): string => {
  if (error instanceof NetworkError) {
    if (error.status === 401) return 'Нужно войти заново / нет токена';
    if (error.status === 403) return 'Недостаточно прав (нужна роль admin/supervisor)';
    if (error.status === 502 || error.status === 503) {
      return 'Сервис WhatsApp временно недоступен, попробуйте позже';
    }

    if (error.message) return error.message;
  }

  return fallback;
};

export function MassOperationsPage() {
  const { roles } = useAuth();
  const isAllowed = useMemo(() => roles.includes('admin') || roles.includes('supervisor'), [roles]);

  const [phones, setPhones] = useState<OrganizationPhone[]>([]);
  const [isLoadingPhones, setIsLoadingPhones] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [broadcastPhoneId, setBroadcastPhoneId] = useState('');
  const [recipientsText, setRecipientsText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('ru');
  const [componentsJson, setComponentsJson] = useState('[{"type":"body","parameters":[]}]');
  const [delayMs, setDelayMs] = useState('250');
  const [dryRun, setDryRun] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResponse, setBroadcastResponse] = useState<BroadcastTemplateResponse | null>(null);
  const [templatesPhoneId, setTemplatesPhoneId] = useState('');
  const [templatesLimit, setTemplatesLimit] = useState('50');
  const [templatesAfter, setTemplatesAfter] = useState('');
  const [templatesName, setTemplatesName] = useState('');
  const [templatesLanguage, setTemplatesLanguage] = useState('');
  const [templatesStatus, setTemplatesStatus] = useState('');
  const [templatesCategory, setTemplatesCategory] = useState('');
  const [templatesError, setTemplatesError] = useState('');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesList, setTemplatesList] = useState<WabaTemplateListItem[]>([]);
  const [templatesNextAfter, setTemplatesNextAfter] = useState('');

  const normalizedPreview = useMemo(() => {
    const tokens = recipientsText
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const normalized = tokens
      .map((item) => item.replace(/\D/g, ''))
      .filter(Boolean);
    const uniqueNormalized = Array.from(new Set(normalized));

    return {
      requested: tokens.length,
      normalized: uniqueNormalized.length,
      values: uniqueNormalized,
    };
  }, [recipientsText]);

  const wabaPhones = useMemo(() => phones, [phones]);

  useEffect(() => {
    if (!isAllowed) {
      setIsLoadingPhones(false);
      return;
    }

    const run = async () => {
      setIsLoadingPhones(true);
      try {
        const list = await organizationPhonesApi.getAll();
        const next = Array.isArray(list) ? list : [];
        setPhones(next);
        setLoadError('');
      } catch (e) {
        setLoadError(mapActionError(e, 'Ошибка загрузки списка номеров'));
      } finally {
        setIsLoadingPhones(false);
      }
    };

    void run();
  }, [isAllowed]);

  useEffect(() => {
    if (broadcastPhoneId) return;
    const first = wabaPhones[0];
    if (first) setBroadcastPhoneId(String(first.id));
  }, [broadcastPhoneId, wabaPhones]);

  useEffect(() => {
    if (templatesPhoneId) return;
    const first = wabaPhones[0];
    if (first) setTemplatesPhoneId(String(first.id));
  }, [templatesPhoneId, wabaPhones]);

  const handleBroadcast = async () => {
    const orgId = Number.parseInt(broadcastPhoneId, 10);
    const nextTemplate = templateName.trim();
    const nextLanguage = language.trim() || 'ru';
    const parsedDelay = Number.parseInt(delayMs.trim(), 10);

    if (!Number.isFinite(orgId) || orgId <= 0 || !nextTemplate) {
      setBroadcastError('Укажите organizationPhoneId и templateName');
      return;
    }

    if (normalizedPreview.normalized === 0) {
      setBroadcastError('После нормализации нет валидных номеров');
      return;
    }

    let components: WabaTemplateComponent[] = [{ type: 'body', parameters: [] }];
    const trimmedComponentsJson = componentsJson.trim();

    if (trimmedComponentsJson) {
      try {
        const parsed = JSON.parse(trimmedComponentsJson) as unknown;
        if (!Array.isArray(parsed)) {
          setBroadcastError('components должен быть JSON-массивом');
          return;
        }
        components = parsed as WabaTemplateComponent[];
      } catch {
        setBroadcastError('components содержит невалидный JSON');
        return;
      }
    }

    if (!Number.isFinite(parsedDelay) || parsedDelay < 0) {
      setBroadcastError('delayMs должен быть числом >= 0');
      return;
    }

    setIsBroadcasting(true);
    setBroadcastError('');
    setBroadcastResponse(null);

    try {
      const response = await wabaApi.broadcastTemplate({
        organizationPhoneId: orgId,
        recipients: normalizedPreview.values,
        templateName: nextTemplate,
        language: nextLanguage,
        components,
        delayMs: parsedDelay,
        dryRun,
      });
      setBroadcastResponse(response);
      emitToast(dryRun ? 'Dry run успешно выполнен' : 'Рассылка отправлена');
    } catch (e) {
      setBroadcastError(mapActionError(e, 'Не удалось выполнить рассылку по шаблону'));
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleLoadTemplates = async (nextAfter?: string) => {
    const orgId = Number.parseInt(templatesPhoneId, 10);
    const parsedLimit = Number.parseInt(templatesLimit.trim(), 10);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      setTemplatesError('Укажите organizationPhoneId');
      return;
    }

    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setTemplatesError('limit должен быть числом > 0');
      return;
    }

    setIsLoadingTemplates(true);
    setTemplatesError('');

    try {
      const response = await wabaApi.getTemplates({
        organizationPhoneId: orgId,
        limit: parsedLimit,
        after: (nextAfter ?? templatesAfter).trim() || undefined,
        name: templatesName.trim() || undefined,
        language: templatesLanguage.trim() || undefined,
        status: templatesStatus.trim() || undefined,
        category: templatesCategory.trim() || undefined,
      });
      const items = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.templates)
          ? response.templates
          : [];
      const nextCursor =
        response.nextAfter ||
        response.paging?.cursors?.after ||
        '';

      setTemplatesList(items);
      setTemplatesNextAfter(nextCursor);
      if (typeof nextAfter === 'string') {
        setTemplatesAfter(nextAfter);
      }
    } catch (e) {
      setTemplatesError(mapActionError(e, 'Не удалось загрузить шаблоны'));
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  return (
    <Layout>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Рассылки и масс. операции</h1>
          <p className={styles.subtitle}>Массовая отправка WhatsApp шаблона через WABA API</p>
        </header>

        {!isAllowed ? (
          <div className={styles.error} role="alert">Недостаточно прав (нужна роль admin/supervisor)</div>
        ) : (
          <div className={styles.sections}>
            <section className={styles.section} aria-label="Рассылка шаблона WhatsApp">
            <h2 className={styles.sectionTitle}>Рассылка по шаблону (WABA)</h2>

            {isLoadingPhones ? <div className={styles.loading}>Загрузка номеров...</div> : null}
            {loadError ? <div className={styles.error}>{loadError}</div> : null}

            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Номер организации</span>
                <select value={broadcastPhoneId} onChange={(e) => setBroadcastPhoneId(e.target.value)} className={styles.select}>
                  {wabaPhones.map((item) => (
                    <option key={item.id} value={item.id}>#{item.id} {item.displayName || item.phoneJid}</option>
                  ))}
                </select>
              </label>

              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} label="Template name" placeholder="promo_offer_v1" />
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} label="Language" placeholder="ru" />
              <Input value={delayMs} onChange={(e) => setDelayMs(e.target.value)} label="Delay (ms)" inputMode="numeric" placeholder="250" />
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Получатели (по строкам, через запятую или ;)</span>
              <textarea
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                className={styles.textarea}
                placeholder={'+7 (701) 111-22-33\n77021234567'}
                rows={5}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Components (JSON)</span>
              <textarea
                value={componentsJson}
                onChange={(e) => setComponentsJson(e.target.value)}
                className={styles.textarea}
                placeholder='[{"type":"body","parameters":[]}]'
                rows={4}
              />
            </label>

            <div className={styles.meta}>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                <span>Dry run (без отправки в WABA)</span>
              </label>
              <span className={styles.preview}>Номеров: {normalizedPreview.requested} → после нормализации: {normalizedPreview.normalized}</span>
            </div>

            <div>
              <Button onClick={handleBroadcast} disabled={isBroadcasting || isLoadingPhones || wabaPhones.length === 0}>
                {isBroadcasting ? 'Отправка...' : dryRun ? 'Запустить dry run' : 'Отправить рассылку'}
              </Button>
            </div>

            {broadcastError ? <div className={styles.error}>{broadcastError}</div> : null}

            {broadcastResponse ? (
              <div className={styles.resultWrap}>
                <div className={styles.resultSummary}>
                  <b>Итог:</b> requested {broadcastResponse.totals.requested}, normalized {broadcastResponse.totals.normalized}, success {broadcastResponse.totals.success}, fail {broadcastResponse.totals.fail}
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>to</th>
                        <th>status</th>
                        <th>messageId / error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {broadcastResponse.results.map((item, index) => (
                        <tr key={`${item.to}-${index}`}>
                          <td className={styles.mono}>{item.to}</td>
                          <td>{item.success ? 'success' : 'fail'}</td>
                          <td className={styles.mono}>{item.messageId || item.error || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            </section>

            <section className={styles.section} aria-label="Шаблоны WhatsApp">
              <h2 className={styles.sectionTitle}>Шаблоны WABA</h2>

              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Номер организации</span>
                  <select value={templatesPhoneId} onChange={(e) => setTemplatesPhoneId(e.target.value)} className={styles.select}>
                    {wabaPhones.map((item) => (
                      <option key={item.id} value={item.id}>#{item.id} {item.displayName || item.phoneJid}</option>
                    ))}
                  </select>
                </label>

                <Input value={templatesLimit} onChange={(e) => setTemplatesLimit(e.target.value)} label="Limit" inputMode="numeric" placeholder="50" />
                <Input value={templatesAfter} onChange={(e) => setTemplatesAfter(e.target.value)} label="After cursor" placeholder="cursor..." />
                <Input value={templatesName} onChange={(e) => setTemplatesName(e.target.value)} label="Name" placeholder="promo_offer_v1" />
                <Input value={templatesLanguage} onChange={(e) => setTemplatesLanguage(e.target.value)} label="Language" placeholder="ru / en_US" />
                <Input value={templatesStatus} onChange={(e) => setTemplatesStatus(e.target.value)} label="Status" placeholder="APPROVED" />
                <Input value={templatesCategory} onChange={(e) => setTemplatesCategory(e.target.value)} label="Category" placeholder="MARKETING" />
              </div>

              <div className={styles.actionsRow}>
                <Button onClick={() => { void handleLoadTemplates(); }} disabled={isLoadingTemplates || isLoadingPhones || wabaPhones.length === 0}>
                  {isLoadingTemplates ? 'Загрузка...' : 'Загрузить шаблоны'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { void handleLoadTemplates(templatesNextAfter); }}
                  disabled={isLoadingTemplates || !templatesNextAfter}
                >
                  Следующая страница
                </Button>
              </div>

              {templatesError ? <div className={styles.error}>{templatesError}</div> : null}

              <div className={styles.resultSummary}>
                Загружено шаблонов: {templatesList.length}{templatesNextAfter ? `, next after: ${templatesNextAfter}` : ''}
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>name</th>
                      <th>language</th>
                      <th>status</th>
                      <th>category</th>
                      <th>id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templatesList.length === 0 ? (
                      <tr>
                        <td colSpan={5}>Шаблоны не найдены</td>
                      </tr>
                    ) : (
                      templatesList.map((item, index) => (
                        <tr key={`${String(item.id || item.name || 'template')}-${index}`}>
                          <td>{String(item.name || '—')}</td>
                          <td>{String(item.language || '—')}</td>
                          <td>{String(item.status || '—')}</td>
                          <td>{String(item.category || '—')}</td>
                          <td className={styles.mono}>{String(item.id || '—')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
