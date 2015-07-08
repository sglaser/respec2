all: pcisig nvidia w3c

w3c:
	node tools/test-build.js
	node tools/example-build.js
	node tools/build-w3c-common.js

pcisig:
	node tools-pcisig/test-build.js
	node tools-pcisig/example-build.js
	node tools-pcisig/build-pcisig-common.js

nv nvidia:
	node tools-nvidia/test-build.js
	node tools-nvidia/example-build.js
	node tools-nvidia/build-nvidia-common.js

nv1:
	node tools-nvidia/build-nvidia-common.js
	cp builds/respec-nvidia-common.js ~/Desktop/NVLink/PCIe_on_NVLink/
	cp stylesheets/unofficial-nvidia.css ~/Desktop/NVLink/PCIe_on_NVLink/

