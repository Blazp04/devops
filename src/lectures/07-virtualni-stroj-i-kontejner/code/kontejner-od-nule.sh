#!/usr/bin/env bash
# „Kontejner” od nule – samo na Linuxu (na Macu unutar Linux VM-a), kao root.
# Nema slike ni Dockera: samo imenski prostori i kontrolna grupa, ručno.

# 1) Naočale: nova ljuska u novim imenskim prostorima
#    pid  – vlastito brojanje procesa (ljuska je PID 1)
#    mnt  – vlastiti pogled na montirane datotečne sustave (--mount-proc ga uključuje)
#    uts  – vlastito ime računala
#    net  – vlastita mreža (samo lo, i to ugašen)
sudo unshare --pid --fork --mount-proc --uts --net bash

# … sad smo unutra (datoteke domaćina i dalje vidimo – „/” nismo zamijenili):
hostname kontejner-od-nule   # mijenja ime samo u ovom imenskom prostoru
ps -e                        # samo bash (PID 1) i ps
ip link                      # samo lo
exit

# 2) Pojas: kontrolna grupa (cgroup v2) s ograničenjem memorije i procesora
sudo mkdir /sys/fs/cgroup/klopa-demo
echo 256M | sudo tee /sys/fs/cgroup/klopa-demo/memory.max
echo "20000 100000" | sudo tee /sys/fs/cgroup/klopa-demo/cpu.max     # 20 ms u svakih 100 ms
echo $$ | sudo tee /sys/fs/cgroup/klopa-demo/cgroup.procs            # ova ljuska ulazi u pojas
cat /proc/self/cgroup                                                  # 0::/klopa-demo
