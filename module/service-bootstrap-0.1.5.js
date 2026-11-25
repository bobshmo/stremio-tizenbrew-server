'use strict';

// TizenBrew evaluates service modules in a vm sandbox and does not call
// exported lifecycle hooks. Load the bundle with Node 4 buffer compatibility.
var runtimeRequire = process.mainModule && process.mainModule.require
    ? process.mainModule.require.bind(process.mainModule)
    : require;
var http = runtimeRequire('http');
var https = runtimeRequire('https');
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
            var BufferCtor = sandboxGlobal.Buffer;
            if (BufferCtor) {
                BufferCtor.from = function(value, encodingOrOffset, length) {
                    return new BufferCtor(value, encodingOrOffset, length);
                };
                if (!BufferCtor.alloc) BufferCtor.alloc = function(size, fill, encoding) {
                    var buffer = new BufferCtor(size);
                    if (fill === undefined) buffer.fill(0);
                    else buffer.fill(fill, encoding);
                    return buffer;
                };
                if (!BufferCtor.allocUnsafe) BufferCtor.allocUnsafe = function(size) {
                    return new BufferCtor(size);
                };
            }
            sandboxGlobal.global = sandboxGlobal;
            sandboxGlobal.require = runtimeRequire;
            if (typeof sandboxGlobal.self === 'undefined') sandboxGlobal.self = sandboxGlobal;
            eval(source);
            if (module && module.exports && typeof module.exports.onStart === 'function') {
                module.exports.onStart();
            }
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
