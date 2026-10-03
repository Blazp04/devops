# token se predaje izgradnji kao tajna, a ne kao --build-arg
docker build --secret id=npmrc,src=$HOME/.npmrc -t registry.klopa.example/klopa-web:1.3.2 .
