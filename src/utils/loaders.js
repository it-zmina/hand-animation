import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader";

const loadAsset = (gltfFilename, onLoad) => {
	const loader = new GLTFLoader()
	// Provide a DRACOLoader instance to decode compressed mesh data
	const draco = new DRACOLoader()
	draco.setDecoderPath('draco/')
	loader.setDRACOLoader(draco)

	loader.load(gltfFilename, (gltf) => {
			if (onLoad) {
				onLoad(gltf)
			}
		},
		null,
		(error) => console.error(`An error happened: ${error}`)
	)
}

export {loadAsset}
