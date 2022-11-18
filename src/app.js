import * as THREE from 'three'
import {VRButton} from "three/examples/jsm/webxr/VRButton"
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import {XRControllerModelFactory} from "three/examples/jsm/webxr/XRControllerModelFactory";
import {XRHandModelFactory} from "three/examples/jsm/webxr/XRHandModelFactory";

import blimp from "../assets/Blimp.glb"
import {loadAsset} from "./utils/loaders";
import {OculusHandModel} from "three/examples/jsm/webxr/OculusHandModel";
import {ConsoleButtons, ORANGE_BUTTON} from "./ConsoleButtons";
import {World} from "three/examples/jsm/libs/ecsy.module";

class App {

    constructor() {
		this.world = new World();
		this.clock = new THREE.Clock();


		const container = document.createElement('div')
        document.body.appendChild(container)

        this.camera = new THREE.PerspectiveCamera(50,
            window.innerWidth / window.innerHeight, 0.1, 200)
        this.camera.position.set(0, 1.6, 3)

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x505050)

        const ambient = new THREE.HemisphereLight(0x606060, 0x404040, 1)
        this.scene.add(ambient)

        const light = new THREE.DirectionalLight(0xffffff)
        light.position.set(1, 1, 1).normalize()
        this.scene.add(light)

        this.controls = new OrbitControls(this.camera, container);
        this.controls.target.set(0, 1.6, 0);
        this.controls.update();

        this.renderer = new THREE.WebGLRenderer({antialias: true})
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.outputEncoding = THREE.sRGBEncoding
        this.renderer.shadowMap.enabled = true;
        this.renderer.xr.enabled = true;

        container.appendChild(this.renderer.domElement)

		// this.initFloor()

		this.initScene()
        this.setupVR()

		this.initConsole()

        window.addEventListener('resize', this.resize.bind(this))
        this.renderer.setAnimationLoop(this.render.bind(this))
    }

    initFloor() {
        const floorGeometry = new THREE.PlaneGeometry(4, 4);
        const floorMaterial = new THREE.MeshStandardMaterial({color: 0x222222});
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        this.scene.add(new THREE.HemisphereLight(0x808080, 0x606060));

        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(0, 6, 0);
        light.castShadow = true;
        light.shadow.camera.top = 2;
        light.shadow.camera.bottom = -2;
        light.shadow.camera.right = 2;
        light.shadow.camera.left = -2;
        light.shadow.mapSize.set(4096, 4096);
        this.scene.add(light);
    }

	initConsole() {
		const self = this
		const consoleButtons = new ConsoleButtons({
				scene: this.scene,
				world: this.world,
				handModelLeft: this.handModels.left[this.currentHandModel.left],
				handModelRight: this.handModels.right[this.currentHandModel.right],
				gripRight: this.gripRight,
				gripLeft: this.gripLeft,
				renderer: this.renderer,
				camera: this.camera
			})
		consoleButtons.setAction(ORANGE_BUTTON, () => {
			self.blimp.translateY(.1)
			console.debug('Orange button pressed')
		})
	}

    initScene() {
        const self = this
        const geometry = new THREE.BoxBufferGeometry(.5, .5, .5)
        const material = new THREE.MeshStandardMaterial({color: 0xFF0000})
        this.mesh = new THREE.Mesh(geometry, material)
        this.scene.add(this.mesh)

        const geometrySphere = new THREE.SphereGeometry(.7, 32, 16)
        const materialSphere = new THREE.MeshBasicMaterial({color: 0xffff00})
        const sphere = new THREE.Mesh(geometrySphere, materialSphere)
        this.scene.add(sphere)

        sphere.position.set(1.5, 0, -1)

        loadAsset(blimp, -.5, .5, -1, gltfScene => {
            const scale = 5
			gltfScene.scale.set(scale, scale, scale)
            self.blimp = gltfScene
			self.scene.add(gltfScene)
        })
    }

    setupVR() {
        this.renderer.xr.enabled = true
        document.body.appendChild(VRButton.createButton(this.renderer))
        // Possible values: viewer,local,local-floor,bounded-floor,unbounded
        this.renderer.xr.setReferenceSpaceType('local-floor')
        const controllerModel = new XRControllerModelFactory()

        // Add left grip controller
        const gripRight = this.renderer.xr.getControllerGrip(0)
        gripRight.add(controllerModel.createControllerModel(gripRight))
        this.scene.add(gripRight)

        // Add right grip controller
        const gripLeft = this.renderer.xr.getControllerGrip(1)
        gripLeft.add(controllerModel.createControllerModel(gripLeft))
        this.scene.add(gripLeft)

        this.gripLeft = gripLeft
        this.gripRight = gripRight

        // Add beams
        const geometry = new THREE.BufferGeometry()
            .setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1)
            ])
        const line = new THREE.Line(geometry)
        line.name = 'line'
        line.scale.z = 5

        gripRight.add(line.clone())
        gripLeft.add(line.clone())

        // Add hands
        this.handModels = {left: null, right: null}
        this.currentHandModel = {left: 0, right: 0}

        const handModelFactory = new XRHandModelFactory()

		// Hand left
        this.handLeft = this.renderer.xr.getHand(0);
        this.scene.add(this.handLeft);

        this.handModels.left = [
			new OculusHandModel( this.handLeft ),
            handModelFactory.createHandModel(this.handLeft, "boxes"),
            handModelFactory.createHandModel(this.handLeft, "spheres"),
            handModelFactory.createHandModel(this.handLeft, 'mesh')
        ];

        this.handModels.left.forEach(model => {
            model.visible = false;
            this.handLeft.add(model);
        });

        this.handModels.left[this.currentHandModel.left].visible = true;

        // Hand Right
        this.handRight = this.renderer.xr.getHand(1);
        this.scene.add(this.handRight);

        this.handModels.right = [
			new OculusHandModel( this.handRight ),
            handModelFactory.createHandModel(this.handRight, "boxes"),
            handModelFactory.createHandModel(this.handRight, "spheres"),
            handModelFactory.createHandModel(this.handRight, 'mesh')
        ];

        this.handModels.right.forEach(model => {
            model.visible = false;
            this.handRight.add(model);
        });

        this.handModels.right[this.currentHandModel.right].visible = true;

        this.addActions()
    }

    addActions() {
        const self = this;

        this.gripRight.addEventListener('selectstart', () => {
            // self.blimp.rotateY(90)
        })

        this.gripRight.addEventListener('squeezestart', () => {
            self.blimp.translateY(.1)
        })

        this.gripLeft.addEventListener('selectstart', () => {
            // self.blimp.rotateY(-90)
        })

        this.gripLeft.addEventListener('squeezestart', () => {
            self.blimp.translateY(-.1)
        })

        this.handRight.addEventListener('pinchend', (evt) => {
            self.cycleHandModel.bind(self, evt.handedness).call()
        })

		this.handRight.addEventListener('pinchend', evt => {
			self.changeAngle.bind(self, evt.handedness).call();
		})

        this.handLeft.addEventListener('pinchend', (evt) => {
			self.cycleHandModel.bind(self, evt.handedness).call()
        })

		this.handLeft.addEventListener('pinchend', evt => {
			self.changeAngle.bind(self, evt.handedness).call();
		})

	}

    changeAngle(hand) {
        if (blimp && hand === 'right') {
            this.blimp.rotateY(45)
        } else if (blimp && hand === 'left') {
			this.blimp.rotateY(-45)
		}
    }

    cycleHandModel(hand) {
		if (hand === 'left' || hand === 'right') {
			this.handModels[hand][this.currentHandModel[hand]].visible = false
			this.currentHandModel[hand] = (this.currentHandModel[hand] + 1) % this.handModels[hand].length
			this.handModels[hand][this.currentHandModel[hand]].visible = true
		}
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    render() {
		const delta = this.clock.getDelta();
		const elapsedTime = this.clock.elapsedTime;
		this.renderer.xr.updateCamera( this.camera );
		this.world.execute( delta, elapsedTime );

		if (this.mesh) {
            this.mesh.rotateX(0.005)
            this.mesh.rotateY(0.01)
        }

        // if (this.blimp) {
        //   this.blimp.rotateY(0.1 * xAxis)
        //   this.blimp.translateY(.02 * yAxis)
        // }
        this.renderer.render(this.scene, this.camera)
    }
}

export {App}
