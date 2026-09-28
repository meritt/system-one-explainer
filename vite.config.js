import { russianPlugin } from './i18n/plugin.mjs';

// The original English build stays the default. No upstream source is edited.
export default ({ mode }) => ({
  plugins: mode === 'ru' ? [russianPlugin()] : [],
});
