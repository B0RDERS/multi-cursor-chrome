export interface TextareaPreferences {
  monospace: boolean;
  noWrap: boolean;
}

/** CSS also reaches textareas inserted after the settings have been applied. */
export function textareaPreferenceCSS(settings: TextareaPreferences): string {
  const declarations = [
    settings.monospace
      ? 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;'
      : '',
    settings.noWrap
      ? 'white-space:pre!important;overflow-wrap:normal!important;word-break:normal!important;overflow-x:auto!important;'
      : '',
  ].join('');
  const scrollbarStyle = settings.noWrap
    ? 'textarea::-webkit-scrollbar-corner{background-color:transparent;}'
    : '';
  return declarations ? `textarea{${declarations}}${scrollbarStyle}` : '';
}
