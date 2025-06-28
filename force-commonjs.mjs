// Custom loader to force CommonJS for specific modules
export async function resolve(specifier, context, defaultResolve) {
  // Force @bsv/payment-express-middleware to be treated as CommonJS
  if (specifier.includes('@bsv/payment-express-middleware')) {
    const resolution = await defaultResolve(specifier, context);
    return {
      ...resolution,
      format: 'commonjs'
    };
  }
  
  return defaultResolve(specifier, context);
}

export async function load(url, context, defaultLoad) {
  // Force specific files to be loaded as CommonJS
  if (url.includes('@bsv/payment-express-middleware')) {
    const result = await defaultLoad(url, { ...context, format: 'commonjs' });
    return result;
  }
  
  return defaultLoad(url, context);
}

