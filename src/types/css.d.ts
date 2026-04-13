// CSS Modules の型宣言。これがないと *.module.css の import で
// TypeScript が型解決に失敗する。
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// 通常の *.css を副作用 import するための宣言
declare module '*.css';

// SVG を文字列 URL として import するため
declare module '*.svg' {
  const src: string;
  export default src;
}

// vite-plugin-pwa の仮想モジュール（使用する場合）
declare module 'virtual:pwa-register' {
  export type RegisterSWOptions = {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (swRegistration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  };
  export function registerSW(
    options?: RegisterSWOptions
  ): (reloadPage?: boolean) => Promise<void>;
}
