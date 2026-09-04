const http = require('http');

const requestJson = (app, { method = 'GET', path = '/', body, headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const payload = body === undefined ? null : JSON.stringify(body);
      const requestHeaders = {
        ...(payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : {}),
        ...headers,
      };

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: requestHeaders,
        },
        (res) => {
          let rawBody = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            rawBody += chunk;
          });
          res.on('end', () => {
            server.close(() => {
              let parsedBody = rawBody;
              const contentType = res.headers['content-type'] || '';
              if (rawBody && contentType.includes('application/json')) {
                try {
                  parsedBody = JSON.parse(rawBody);
                } catch {
                  parsedBody = rawBody;
                }
              }

              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: parsedBody,
                rawBody,
              });
            });
          });
        }
      );

      req.on('error', (error) => {
        server.close(() => reject(error));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });

module.exports = {
  requestJson,
};
