import { relative } from 'node:path';
import { translateSource, verifyProject } from './translate.mjs';

export function russianPlugin() {
  let root;
  return {
    name: 'system-one-russian-mirror',
    enforce: 'pre',
    configResolved(config) { root = config.root; },
    buildStart() { verifyProject(root); },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const translated = translateSource('index.html', html);
        return translated.replace('</head>', '    <link rel="stylesheet" href="/i18n/ru.css" />\n  </head>');
      },
    },
    transform(code, id) {
      const path = relative(root, id.split('?')[0]).replaceAll('\\', '/');
      if (!path.startsWith('src/') || !path.endsWith('.js')) return null;
      const translated = translateSource(path, code);
      return translated === code ? null : { code: translated, map: null };
    },
  };
}
