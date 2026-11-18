// The Android bridge injects generated plugin proxies before application modules.
// Using those proxies keeps the existing no-bundler web build and dev server intact.
export const isAndroid = () => globalThis.Capacitor?.getPlatform?.() === 'android';
export function nativePlugin(name) {
  if (!isAndroid()) throw Error('Эта функция доступна только в Android-приложении.');
  const plugin=globalThis.Capacitor.Plugins?.[name];
  if (!plugin) throw Error('Нативный модуль недоступен. Обновите Android-приложение.');
  return plugin;
}
