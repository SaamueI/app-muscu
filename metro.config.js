const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support .sql imports for Drizzle migrations (processed by babel-plugin-inline-import)
config.resolver.sourceExts.push('sql');

module.exports = config;
