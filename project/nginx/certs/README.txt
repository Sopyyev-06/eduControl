TLS kepilnamalaryny şu papka goýuň:
  fullchain.pem
  privkey.pem
soňra docker-compose.yml-de 443 portuny açyň we nginx.conf-da TLS server blokuny goşuň.
Özüňiziň torunda: openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
  -keyout privkey.pem -out fullchain.pem -subj "/CN=educontrol.local"
