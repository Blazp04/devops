# Koliko je daleko poslužitelj? Izmjerite sami.
# Upišite poslužitelje koje smijete pingati: jedan blizu, jedan na drugom kontinentu.
BLIZU="<poslužitelj u vašem gradu>"
DALEKO="<poslužitelj na drugom kontinentu>"

# 1) Vrijeme povratnog puta (RTT), pet paketa
ping -c 5 "$BLIZU"
ping -c 5 "$DALEKO"

# 2) Kroz koje usmjerivače paket prolazi i gdje se gubi vrijeme
#    (na macOS-u: brew install mtr, pa sudo mtr …)
mtr --report --report-cycles 10 "$DALEKO"

# 3) Nova HTTPS veza: TCP, pa TLS, pa prvi bajt odgovora
curl -s -o /dev/null \
  -w 'TCP: %{time_connect} s\nTLS: %{time_appconnect} s\nprvi bajt: %{time_starttransfer} s\n' \
  "https://$DALEKO/"

# 4) Timeout: curl čeka odgovor najviše 2 sekunde
curl --max-time 2 -s -o /dev/null -w '%{http_code}\n' "https://$DALEKO/"
