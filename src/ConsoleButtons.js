import {Component, System, TagComponent, Types, World} from "three/examples/jsm/libs/ecsy.module";

import buttonPress from "../assets/sounds/button-press.ogg"
import buttonRelease from "../assets/sounds/button-release.ogg"
import * as THREE from "three";
import {createText} from "three/examples/jsm/webxr/Text2D";

const POINTING_JOINT = 'index-finger-tip'
const ORANGE_BUTTON = 'orangeButton'
const PINK_BUTTON = 'pinkButton'
const EXIT_BUTTON = 'exitButton'

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
			audioLoader.load( buttonPress, function ( buffer ) {

				buttonPressSound.setBuffer( buffer );

			} );
			audioLoader.load( buttonRelease, function ( buffer ) {

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

class ConsoleButtons {

	constructor(attributes) {
		this.scene = attributes.scene
		this.world = attributes.world
		this.handModelLeft = attributes.handModelLeft
		this.handModelRight = attributes.handModelRight
		this.gripRight = attributes.gripRight
		this.gripLeft = attributes.gripLeft
		this.renderer = attributes.renderer
		this.camera = attributes.camera

		const self = this

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
			.registerSystem( FingerInputSystem, {hands: [this.handModelLeft, this.handModelRight]});

		const csEntity = this.world.createEntity();
		csEntity.addComponent( OffsetFromCamera, { x: 0, y: - 0.4, z: - 0.3 } );
		csEntity.addComponent( NeedCalibration );
		csEntity.addComponent( Object3D, { object: consoleMesh } );

		const obEntity = this.world.createEntity();
		obEntity.name = ORANGE_BUTTON
		obEntity.addComponent( Pressable );
		obEntity.addComponent( Object3D, { object: orangeButton } );
		this.orangeButtonAction = function () {

			torusKnot.material.color.setHex( 0xffd3b5 );

		};

		obEntity.addComponent( Button, { action: this.orangeButtonAction, surfaceY: 0.05, fullPressDistance: 0.02 } );

		const pbEntity = this.world.createEntity();
		pbEntity.addComponent( Pressable );
		pbEntity.addComponent( Object3D, { object: pinkButton } );
		this.pinkButton = function () {

			torusKnot.material.color.setHex( 0xe84a5f );

		};

		pbEntity.addComponent( Button, { action: this.pinkButton, surfaceY: 0.05, fullPressDistance: 0.02 } );

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

				exitText.visible = false;
				self.renderer.xr.getSession().end();

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

	setAction(name, action) {
		const entities = this.world.getSystem(ButtonSystem).queries.buttons.results
		const entity = entities.filter(e => e.name === name)[0]
		const button = entity.getMutableComponent( Button )
		button.action = action
	}
}

export {ConsoleButtons, EXIT_BUTTON, ORANGE_BUTTON, PINK_BUTTON}
