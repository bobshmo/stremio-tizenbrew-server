'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var babel = require('@babel/core');
var root = __dirname;
var browserifyCli = path.join(root, 'node_modules', 'browserify', 'bin', 'cmd.js');
var entry = path.join(root, 'src', 'service-entry.js');
var intermediate = path.join(root, 'module', 'service.bundle.raw.js');
var output = path.join(root, 'module', 'service.bundle.js');

var built = cp.spawnSync(process.execPath, [browserifyCli, entry, '--bare', '--no-browser-field', '--exclude', 'utf-8-validate', '--exclude', 'bufferutil', '--standalone', 'StremioTizenService', '--outfile', intermediate], { stdio: 'inherit' });
if (built.error) throw built.error;
if (built.status !== 0) throw new Error('browserify failed with exit code ' + built.status);

var source = fs.readFileSync(intermediate, 'utf8');
var result = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    comments: false,
    compact: true,
    sourceType: 'script',
    presets: [[require.resolve('@babel/preset-env'), { targets: { node: '4.4.3' }, modules: false }]]
});
fs.writeFileSync(output, "if(typeof self==='undefined'){self=this;}\n" + result.code + '\n');
fs.unlinkSync(intermediate);
console.log('Built Node 4.4.3 bundle: ' + output + ' (' + Buffer.byteLength(result.code, 'utf8') + ' bytes)');

