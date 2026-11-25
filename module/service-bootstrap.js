'use strict';

// TizenBrew evaluates service modules in a vm sandbox, omits Node's global
// alias, and does not call exported lifecycle hooks. The module's bundled
// Node built-ins must resolve through the native Node module loader.
var fetch = require('node-fetch');
fetch('https://cdn.jsdelivr.net/gh/bobshmo/stremio-tizenbrew-server/module/service.bundle.js')
    .then(function(response) {
        if (!response.ok) throw new Error('bundle fetch failed: ' + response.status);
        return response.text();
    })
    .then(function(source) {
        var sandboxGlobal = Function('return this')();
        var nativeRequire = process.mainModule && process.mainModule.require
            ? process.mainModule.require.bind(process.mainModule)
            : require;
        sandboxGlobal.global = sandboxGlobal;
        sandboxGlobal.require = nativeRequire;
        if (typeof sandboxGlobal.self === 'undefined') sandboxGlobal.self = sandboxGlobal;
        eval(source +
            "\\nif(module&&module.exports&&typeof module.exports.onStart==='function'){module.exports.onStart();}");
    })
    .catch(function(error) {
        console.log('Stremio service bootstrap failed: ' + (error && error.stack || error));
    });
