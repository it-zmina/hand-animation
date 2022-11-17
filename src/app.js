import * as THREE from 'three'
import {VRButton} from "three/examples/jsm/webxr/VRButton"
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import {XRControllerModelFactory} from "three/examples/jsm/webxr/XRControllerModelFactory";
import {XRHandModelFactory} from "three/examples/jsm/webxr/XRHandModelFactory";

import blimp from "../assets/Blimp.glb"
import {loadAsset} from "./utils/loaders";
import {Component, System, TagComponent, Types, World} from "three/examples/jsm/libs/ecsy.module";
import {OculusHandModel} from "three/examples/jsm/webxr/OculusHandModel";
import {createText} from "three/examples/jsm/webxr/Text2D";


const POINTING_JOINT = 'index-finger-tip'

class Object3D extends Component { }

Object3D.schema = {
	object: { type: Types.Ref }
};

class Button extends Component { }

Button.schema = {
	// button states: [resting, pressed, fully_pressed, recovering]
	currState: { type: Types.String, default: 'resting' },
	prevState: { type: Types.String, default: 'resting' },
	pressSound: { type: Types.Ref, default: null },
	releaseSound: { type: Types.Ref, default: null },
	restingY: { type: Types.Number, default: null },
	surfaceY: { type: Types.Number, default: null },
	recoverySpeed: { type: Types.Number, default: 0.4 },
	fullPressDistance: { type: Types.Number, default: null },
	action: { type: Types.Ref, default: () => { } }
};

class ButtonSystem extends System {

	init( attributes ) {

		this.renderer = attributes.renderer;
		this.soundAdded = false;

	}

	execute( /*delta, time*/ ) {

		let buttonPressSound, buttonReleaseSound;
		if ( this.renderer.xr.getSession() && ! this.soundAdded ) {

			const xrCamera = this.renderer.xr.getCamera();

			const listener = new THREE.AudioListener();
			xrCamera.add( listener );

			// create a global audio source
			buttonPressSound = new THREE.Audio( listener );
			buttonReleaseSound = new THREE.Audio( listener );

			// load a sound and set it as the Audio object's buffer
			const audioLoader = new THREE.AudioLoader();
			audioLoader.load( 'sounds/button-press.ogg', function ( buffer ) {

				buttonPressSound.setBuffer( buffer );

			} );
			audioLoader.load( 'sounds/button-release.ogg', function ( buffer ) {

				buttonReleaseSound.setBuffer( buffer );

			} );
			this.soundAdded = true;

		}

		this.queries.buttons.results.forEach( entity => {

			const button = entity.getMutableComponent( Button );
			const buttonMesh = entity.getComponent( Object3D ).object;
			// populate restingY
			if ( button.restingY == null ) {

				button.restingY = buttonMesh.position.y;

			}

			if ( buttonPressSound ) {

				button.pressSound = buttonPressSound;

			}

			if ( buttonReleaseSound ) {

				button.releaseSound = buttonReleaseSound;

			}

			if ( button.currState === 'fully_pressed' && button.prevState !== 'fully_pressed' ) {

				button.pressSound?.play();
				button.action();

			}

			if ( button.currState === 'recovering' && button.prevState !== 'recovering' ) {

				button.releaseSound?.play();

			}

			// preserve prevState, clear currState
			// FingerInputSystem will update currState
			button.prevState = button.currState;
			button.currState = 'resting';

		} );

	}

}

ButtonSystem.queries = {
	buttons: {
		components: [ Button ]
	}
};

class Pressable extends TagComponent { }

class FingerInputSystem extends System {

	init( attributes ) {

		this.hands = attributes.hands;

	}

	execute( delta/*, time*/ ) {

		this.queries.pressable.results.forEach( entity => {

			const button = entity.getMutableComponent( Button );
			const object = entity.getComponent( Object3D ).object;
			const pressingDistances = [];
			this.hands.forEach( hand => {

				if ( hand && hand.intersectBoxObject( object ) ) {

					const pressingPosition = hand.getPointerPosition();
					pressingDistances.push( button.surfaceY - object.worldToLocal( pressingPosition ).y );

				}

			} );
			if ( pressingDistances.length === 0 ) { // not pressed this frame

				if ( object.position.y < button.restingY ) {

					object.position.y += button.recoverySpeed * delta;
					button.currState = 'recovering';

				} else {

					object.position.y = button.restingY;
					button.currState = 'resting';

				}

			} else {

				button.currState = 'pressed';
				const pressingDistance = Math.max( pressingDistances );
				if ( pressingDistance > 0 ) {

					object.position.y -= pressingDistance;

				}

				if ( object.position.y <= button.restingY - button.fullPressDistance ) {

					button.currState = 'fully_pressed';
					object.position.y = button.restingY - button.fullPressDistance;

				}

			}

		} );

	}

}

FingerInputSystem.queries = {
	pressable: {
		components: [ Pressable ]
	}
};

class Rotating extends TagComponent { }

class RotatingSystem extends System {

	execute( delta/*, time*/ ) {

		this.queries.rotatingObjects.results.forEach( entity => {

			const object = entity.getComponent( Object3D ).object;
			object.rotation.x += 0.4 * delta;
			object.rotation.y += 0.4 * delta;

		} );

	}

}

RotatingSystem.queries = {
	rotatingObjects: {
		components: [ Rotating ]
	}
};

class HandsInstructionText extends TagComponent { }

class InstructionSystem extends System {

	init( attributes ) {

		this.controllers = attributes.controllers;

	}

	execute( /*delta, time*/ ) {

		let visible = false;
		this.controllers.forEach( controller => {

			if ( controller.visible ) {

				visible = true;

			}

		} );

		this.queries.instructionTexts.results.forEach( entity => {

			const object = entity.getComponent( Object3D ).object;
			object.visible = visible;

		} );

	}

}

InstructionSystem.queries = {
	instructionTexts: {
		components: [ HandsInstructionText ]
	}
};

class OffsetFromCamera extends Component { }

OffsetFromCamera.schema = {
	x: { type: Types.Number, default: 0 },
	y: { type: Types.Number, default: 0 },
	z: { type: Types.Number, default: 0 },
};

class NeedCalibration extends TagComponent { }

class CalibrationSystem extends System {

	init( attributes ) {

		this.camera = attributes.camera;
		this.renderer = attributes.renderer;

	}

	execute( /*delta, time*/ ) {

		this.queries.needCalibration.results.forEach( entity => {

			if ( this.renderer.xr.getSession() ) {

				const offset = entity.getComponent( OffsetFromCamera );
				const object = entity.getComponent( Object3D ).object;
				const xrCamera = this.renderer.xr.getCamera();
				object.position.x = xrCamera.position.x + offset.x;
				object.position.y = xrCamera.position.y + offset.y;
				object.position.z = xrCamera.position.z + offset.z;
				entity.removeComponent( NeedCalibration );

			}

		} );

	}

}

CalibrationSystem.queries = {
	needCalibration: {
		components: [ NeedCalibration ]
	}
};

// let camera, scene, renderer;


function makeButtonMesh( x, y, z, color ) {

	const geometry = new THREE.BoxGeometry( x, y, z );
	const material = new THREE.MeshPhongMaterial( { color: color } );
	const buttonMesh = new THREE.Mesh( geometry, material );
	buttonMesh.castShadow = true;
	buttonMesh.receiveShadow = true;
	return buttonMesh;

}


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
		// buttons
		const floorGeometry = new THREE.PlaneGeometry( 4, 4 );
		const floorMaterial = new THREE.MeshPhongMaterial( { color: 0x222222 } );
		const floor = new THREE.Mesh( floorGeometry, floorMaterial );
		floor.rotation.x = - Math.PI / 2;
		floor.receiveShadow = true;
		this.scene.add( floor );

		const consoleGeometry = new THREE.BoxGeometry( 0.5, 0.12, 0.15 );
		const consoleMaterial = new THREE.MeshPhongMaterial( { color: 0x595959 } );
		const consoleMesh = new THREE.Mesh( consoleGeometry, consoleMaterial );
		consoleMesh.position.set( 0, 1, - 0.3 );
		consoleMesh.castShadow = true;
		consoleMesh.receiveShadow = true;
		this.scene.add( consoleMesh );

		const orangeButton = makeButtonMesh( 0.08, 0.1, 0.08, 0xffd3b5 );
		orangeButton.position.set( - 0.15, 0.04, 0 );
		consoleMesh.add( orangeButton );

		const pinkButton = makeButtonMesh( 0.08, 0.1, 0.08, 0xe84a5f );
		pinkButton.position.set( - 0.05, 0.04, 0 );
		consoleMesh.add( pinkButton );

		const resetButton = makeButtonMesh( 0.08, 0.1, 0.08, 0x355c7d );
		const resetButtonText = createText( 'reset', 0.03 );
		resetButton.add( resetButtonText );
		resetButtonText.rotation.x = - Math.PI / 2;
		resetButtonText.position.set( 0, 0.051, 0 );
		resetButton.position.set( 0.05, 0.04, 0 );
		consoleMesh.add( resetButton );

		const exitButton = makeButtonMesh( 0.08, 0.1, 0.08, 0xff0000 );
		const exitButtonText = createText( 'exit', 0.03 );
		exitButton.add( exitButtonText );
		exitButtonText.rotation.x = - Math.PI / 2;
		exitButtonText.position.set( 0, 0.051, 0 );
		exitButton.position.set( 0.15, 0.04, 0 );
		consoleMesh.add( exitButton );

		const tkGeometry = new THREE.TorusKnotGeometry( 0.5, 0.2, 200, 32 );
		const tkMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff } );
		tkMaterial.metalness = 0.8;
		const torusKnot = new THREE.Mesh( tkGeometry, tkMaterial );
		torusKnot.position.set( 0, 1, - 5 );
		this.scene.add( torusKnot );

		const instructionText = createText( 'This is a WebXR Hands demo, please explore with hands.', 0.04 );
		instructionText.position.set( 0, 1.6, - 0.6 );
		this.scene.add( instructionText );

		const exitText = createText( 'Exiting session...', 0.04 );
		exitText.position.set( 0, 1.5, - 0.6 );
		exitText.visible = false;
		this.scene.add( exitText );

		this.world
			.registerComponent( Object3D )
			.registerComponent( Button )
			.registerComponent( Pressable )
			.registerComponent( Rotating )
			.registerComponent( HandsInstructionText )
			.registerComponent( OffsetFromCamera )
			.registerComponent( NeedCalibration );

		this.world
			.registerSystem( RotatingSystem )
			.registerSystem( InstructionSystem, { controllers: [ this.gripRight, this.gripLeft ] } )
			.registerSystem( CalibrationSystem, { renderer: this.renderer, camera: this.camera } )
			.registerSystem( ButtonSystem, { renderer: this.renderer, camera: this.camera } )
			.registerSystem( FingerInputSystem, {
				hands: [
					this.handModels.left[this.currentHandModel.left],
					this.handModels.right[this.currentHandModel.right]
				]
			});

		const csEntity = this.world.createEntity();
		csEntity.addComponent( OffsetFromCamera, { x: 0, y: - 0.4, z: - 0.3 } );
		csEntity.addComponent( NeedCalibration );
		csEntity.addComponent( Object3D, { object: consoleMesh } );

		const obEntity = this.world.createEntity();
		obEntity.addComponent( Pressable );
		obEntity.addComponent( Object3D, { object: orangeButton } );
		const obAction = function () {

			torusKnot.material.color.setHex( 0xffd3b5 );

		};

		obEntity.addComponent( Button, { action: obAction, surfaceY: 0.05, fullPressDistance: 0.02 } );

		const pbEntity = this.world.createEntity();
		pbEntity.addComponent( Pressable );
		pbEntity.addComponent( Object3D, { object: pinkButton } );
		const pbAction = function () {

			torusKnot.material.color.setHex( 0xe84a5f );

		};

		pbEntity.addComponent( Button, { action: pbAction, surfaceY: 0.05, fullPressDistance: 0.02 } );

		const rbEntity = this.world.createEntity();
		rbEntity.addComponent( Pressable );
		rbEntity.addComponent( Object3D, { object: resetButton } );
		const rbAction = function () {

			torusKnot.material.color.setHex( 0xffffff );

		};

		rbEntity.addComponent( Button, { action: rbAction, surfaceY: 0.05, fullPressDistance: 0.02 } );

		const ebEntity = this.world.createEntity();
		ebEntity.addComponent( Pressable );
		ebEntity.addComponent( Object3D, { object: exitButton } );
		const ebAction = function () {

			exitText.visible = true;
			setTimeout( function () {

				exitText.visible = false; renderer.xr.getSession().end();

			}, 2000 );

		};

		ebEntity.addComponent( Button, { action: ebAction, surfaceY: 0.05, recoverySpeed: 0.2, fullPressDistance: 0.03 } );

		const tkEntity = this.world.createEntity();
		tkEntity.addComponent( Rotating );
		tkEntity.addComponent( Object3D, { object: torusKnot } );

		const itEntity = this.world.createEntity();
		itEntity.addComponent( HandsInstructionText );
		itEntity.addComponent( Object3D, { object: instructionText } );

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
        this.currentHandModel = {left: 3, right: 3}

        const handModelFactory = new XRHandModelFactory()

		// Hand left
        this.handLeft = this.renderer.xr.getHand(0);
        this.scene.add(this.handLeft);

        this.handModels.left = [
            handModelFactory.createHandModel(this.handLeft, "boxes"),
            handModelFactory.createHandModel(this.handLeft, "spheres"),
            handModelFactory.createHandModel(this.handLeft, 'mesh'),
			new OculusHandModel( this.handLeft )
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
            handModelFactory.createHandModel(this.handRight, "boxes"),
            handModelFactory.createHandModel(this.handRight, "spheres"),
            handModelFactory.createHandModel(this.handRight, 'mesh'),
			new OculusHandModel( this.handRight )
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
