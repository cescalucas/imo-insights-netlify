/**
 * Parser de multipart/form-data baseado em busboy.
 * Recebe um objeto event do Netlify Functions e devolve { fields, files }.
 *
 * Uso:
 *   const { fields, files } = await parseMultipart(event);
 *   const file = files[0];
 *   // file.buffer, file.name, file.mime, file.size
 */
const Busboy = require('busboy');

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    if (!event.headers) return reject(new Error('headers ausentes'));

    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!/^multipart\/form-data/i.test(ct)) {
      return reject(new Error('Conteúdo não é multipart/form-data.'));
    }

    const fields = {};
    const files = [];

    let bb;
    try {
      bb = Busboy({
        headers: { 'content-type': ct },
        limits: { fileSize: 60 * 1024 * 1024, files: 1 }   // 60 MB hard limit
      });
    } catch (e) { return reject(e); }

    bb.on('field', (name, value) => { fields[name] = value; });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      let size = 0;
      let truncated = false;

      stream.on('data', chunk => { chunks.push(chunk); size += chunk.length; });
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => {
        if (truncated) {
          files.push({ field: name, error: 'truncated', size });
        } else {
          files.push({
            field: name,
            name: info.filename,
            mime: info.mimeType,
            buffer: Buffer.concat(chunks),
            size: size
          });
        }
      });
    });

    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, files }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    bb.end(body);
  });
}

module.exports = { parseMultipart };
