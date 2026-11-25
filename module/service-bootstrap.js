'use strict';

// TizenBrew's service VM lacks Node's global alias and does not call lifecycle
// hooks. Use the native Node loader to retrieve and run the bundled service.
var runtimeRequire = process.mainModule && process.mainModule.require
    ? process.mainModule.require.bind(process.mainModule)
    : require;
var https = runtimeRequire('https');
var http = runtimeRequire('http');
var diagnostics = { status: 'booting', error: null };
var diagnosticServer = http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(diagnostics));
});
diagnosticServer.listen(11471, '127.0.0.1');

https.get('https://cdn.jsdelivr.net/gh/bobshmo/stremio-tizenbrew-server/module/service.bundle.js', function(response) {
    var source = '';
    response.setEncoding('utf8');
    response.on('data', function(chunk) { source += chunk; });
    response.on('end', function() {
        try {
            if (response.statusCode !== 200) throw new Error('bundle fetch failed: ' + response.statusCode);
            var sandboxGlobal = Function('return this')();
            sandboxGlobal.global = sandboxGlobal;
            sandboxGlobal.require = runtimeRequire;
            if (typeof sandboxGlobal.self === 'undefined') sandboxGlobal.self = sandboxGlobal;
            eval(source +
                "\\nif(module&&module.exports&&typeof module.exports.onStart==='function'){module.exports.onStart();}");
            diagnostics.status = 'bundle-evaluated';
        } catch (error) {
            diagnostics.status = 'failed';
            diagnostics.error = error && error.stack || String(error);
            console.log('Stremio service bootstrap failed: ' + diagnostics.error);
        }
    });
}).on('error', function(error) {
    diagnostics.status = 'failed';
    diagnostics.error = error && error.stack || String(error);
    console.log('Stremio service download failed: ' + diagnostics.error);
});
