const http = require('http');

const data = JSON.stringify({
  tipo: "analista",
  preguntaAnalista: "Cuales son los barrios que hemos impactado"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/ia/analisis',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(`BODY: ${body}`));
});

req.on('error', (e) => console.error(`Problem with request: ${e.message}`));
req.write(data);
req.end();
