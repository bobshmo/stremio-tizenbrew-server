'use strict';
var http = require('http');
http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'node-http-ok', node: process.version }));
}).listen(11471, '127.0.0.1');
