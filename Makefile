all:
	node tools/build-w3c-common.js 
	node tools/example-build.js 
	node tools/test-build.js 
	node tools-pcisig/build-pcisig-common.js 
	node tools-pcisig/example-build.js 
	node tools-pcisig/test-build.js 
