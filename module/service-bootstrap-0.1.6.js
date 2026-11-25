'use strict';

// TizenBrew evaluates service modules in an isolated VM and does not invoke
// lifecycle hooks. Fetch and start the bundled Node service with a VM-local
// Node 4 Buffer compatibility wrapper.
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
            var NativeBuffer = sandboxGlobal.Buffer;
            if (NativeBuffer) {
                function BufferCompat(value, encodingOrOffset, length) {
                    return new NativeBuffer(value, encodingOrOffset, length);
                }
                BufferCompat.prototype = NativeBuffer.prototype;
                Object.getOwnPropertyNames(NativeBuffer).forEach(function(key) {
                    try { BufferCompat[key] = NativeBuffer[key]; } catch (error) {}
                });
                BufferCompat.from = function(value, encodingOrOffset, length) {
                    return new NativeBuffer(value, encodingOrOffset, length);
                };
                if (!BufferCompat.alloc) BufferCompat.alloc = function(size, fill, encoding) {
                    var buffer = new NativeBuffer(size);
                    if (fill === undefined) buffer.fill(0);
                    else buffer.fill(fill, encoding);
                    return buffer;
                };
                if (!BufferCompat.allocUnsafe) BufferCompat.allocUnsafe = function(size) {
                    return new NativeBuffer(size);
                };
                sandboxGlobal.Buffer = BufferCompat;
            }
            function sandboxRequire(name) {
                if (name === 'buffer') return { Buffer: sandboxGlobal.Buffer };
                return runtimeRequire(name);
            }
            sandboxGlobal.global = sandboxGlobal;
            sandboxGlobal.require = sandboxRequire;
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
