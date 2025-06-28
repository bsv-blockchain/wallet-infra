// Patch to fix @bsv/payment-express-middleware CommonJS/ES module issue
const fs = require('fs');
const path = require('path');

try {
  // Find the problematic package directly
  const packageDir = path.join(__dirname, 'node_modules/@bsv/payment-express-middleware');
  const packagePath = path.join(packageDir, 'package.json');
  
  console.log('Patching @bsv/payment-express-middleware package.json...');
  
  // Read the package.json
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Remove or modify the exports field that's causing the issue
  if (packageContent.exports) {
    delete packageContent.exports;
    console.log('Removed problematic exports field');
  }
  
  // Ensure it's marked as CommonJS
  packageContent.type = 'commonjs';
  
  // Write the patched package.json
  fs.writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
  
  // Also patch the main module file
  const modPath = path.join(packageDir, 'dist/cjs/mod.js');
  if (fs.existsSync(modPath)) {
    const modContent = fs.readFileSync(modPath, 'utf8');
    if (modContent.includes('Object.defineProperty(exports, "__esModule"')) {
      const patchedModContent = `// Patched CommonJS module
module.exports = module.exports || {};
var exports = module.exports;

${modContent}`;
      fs.writeFileSync(modPath, patchedModContent);
      console.log('Patched mod.js file');
    }
  }
  
  console.log('Successfully patched @bsv/payment-express-middleware');
} catch (error) {
  console.log('Could not patch @bsv/payment-express-middleware:', error.message);
  console.log('Continuing without patch...');
}

