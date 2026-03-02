export const LAYOUT_TOGGLE_MENU_EVENT = 'app:layout-toggle-menu';

export const toggleLayoutMenu = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_TOGGLE_MENU_EVENT));
};
