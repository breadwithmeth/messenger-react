export type WabaTemplateParameter = {
  type: string;
  text?: string;
};

export type WabaTemplateComponent = {
  type: string;
  parameters: WabaTemplateParameter[];
};

export type BroadcastTemplatePayload = {
  organizationPhoneId: number;
  recipients: string[];
  templateName: string;
  language?: string;
  components?: WabaTemplateComponent[];
  delayMs?: number;
  dryRun?: boolean;
};

export type BroadcastTemplateResult = {
  to: string;
  success: boolean;
  messageId?: string;
  error?: string;
};

export type BroadcastTemplateResponse = {
  success: boolean;
  dryRun: boolean;
  organizationPhoneId: number;
  templateName: string;
  language: string;
  totals: {
    requested: number;
    normalized: number;
    success: number;
    fail: number;
  };
  results: BroadcastTemplateResult[];
};
