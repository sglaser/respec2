all: w3c pcisig nvidia

w3c:
	node tools/test-build.js
	node tools/example-build.js
	node tools/build-w3c-common.js

pcisig:
	node tools-pcisig/example-build.js
	node tools-pcisig/test-build.js
	node tools-pcisig/build-pcisig-common.js

nv nvidia:
	node tools-nvidia/example-build.js
	node tools-nvidia/test-build.js
	node tools-nvidia/build-nvidia-common.js
