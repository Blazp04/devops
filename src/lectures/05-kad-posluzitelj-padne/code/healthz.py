# klopa/health.py – adresa koju load balancer provjerava
from django.http import HttpResponse


def healthz(request):
    # 200 znači: ovaj proces radi i prima zahtjeve.
    # Bazu i Redis ovdje namjerno NE provjeravamo: kad bi baza
    # zastala, svi poslužitelji pali bi provjeru u istoj sekundi
    # i load balancer bi izbacio cijelu Klopu.
    return HttpResponse("ok", content_type="text/plain")


# klopa/urls.py
#   path("healthz", health.healthz),
#
# klopa/settings.py – provjera stiže na adresu poslužitelja, ne na klopa.example
#   ALLOWED_HOSTS = ["klopa.example", "10.0.0.11", "10.0.0.12", "10.0.0.13"]
