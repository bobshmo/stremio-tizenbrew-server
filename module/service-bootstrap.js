'use strict';

// TizenBrew runs service modules inside a vm sandbox that omits Node's global
// alias and does not call exported lifecycle hooks. Load the actual service
// bundle, provide that alias, then start its exported server hook.
var fetch = require('node-fetch');
fetch('https://cdn.jsdelivr.net/gh/bobshmo/stremio-tizenbrew-server/module/service.bundle.js')
    .then(function(response) {
        if (!response.ok) throw new Error('bundle fetch failed: ' + response.status);
        return response.text();
    })
    .then(function(source) {
        (0, eval)("if(typeof global==='undefined'){global=this;}\n" + source +
            "\nif(module&&module.exports&&typeof module.exports.onStart==='function'){module.exports.onStart();}");
    })
    .catch(function(error) {
        console.log('Stremio service bootstrap failed: ' + (error && error.stack || error));
    });
