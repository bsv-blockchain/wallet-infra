// CommonJS hook to fix module loading issues
const Module = require('module');
const path = require('path');

// Store the original require function
const originalRequire = Module.prototype.require;

// Override the require function
Module.prototype.require = function(id) {
  // Check if this is the problematic module
  if (id.includes('@bsv/payment-express-middleware')) {
    try {
      // Try to force CommonJS loading by manipulating the package.json
      const resolved = Module._resolveFilename(id, this);
      const packagePath = path.join(path.dirname(resolved), 'package.json');
      
      // Try to load as CommonJS
      if (resolved.includes('dist/cjs/mod.js')) {
        // Load the file content and execute it in CommonJS context
        const fs = require('fs');
        const moduleCode = fs.readFileSync(resolved, 'utf8');
        
        // Create a new module context with proper exports
        const moduleWrapper = `
(function(exports, require, module, __filename, __dirname) {
${moduleCode}
});`;
        
        const compiledModule = eval(moduleWrapper);
        const moduleExports = {};
        const fakeModule = { exports: moduleExports };
        
        compiledModule(moduleExports, require, fakeModule, resolved, path.dirname(resolved));
        
        return fakeModule.exports;
      }
    } catch (error) {
      console.log('Fallback to original require for:', id);
    }
  }
  
  // Fall back to original require
  return originalRequire.apply(this, arguments);
};

