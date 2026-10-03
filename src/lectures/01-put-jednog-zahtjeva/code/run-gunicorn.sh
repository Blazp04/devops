# Bez --bind gunicorn sluša na 127.0.0.1:8000 – samo „iznutra”
gunicorn klopa.wsgi
# [INFO] Listening at: http://127.0.0.1:8000 (812)

# Sve adrese ovog računala, i javna – VPS bez proxyja
gunicorn --bind 0.0.0.0:8000 klopa.wsgi
# [INFO] Listening at: http://0.0.0.0:8000 (813)

# Iza proxyja na istom stroju: opet samo 127.0.0.1 (sigurnije)
gunicorn --bind 127.0.0.1:8000 --workers 3 klopa.wsgi

# Djangov razvojni poslužitelj ima isti zadani izbor (i nije za produkciju)
python manage.py runserver              # http://127.0.0.1:8000/
python manage.py runserver 0.0.0.0:8000
