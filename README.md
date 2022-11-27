# hands-cubes

## Task -- Prepare headset (if required)
1. Enable hands tracking in `Hands and Controllers` settings![](docs/hands-setting.jpg)
2. Open `chrome://flags/` page and enable experimental feature `WebXR experiences with hand and joints tracking` for browser![](docs/browser-config.jpg)

## Task -- Prepared scene with animation
1. Download asset with animation from:
- [https://sketchfab.com/feed]()
- [https://www.cgtrader.com]()
- [https://www.turbosquid.com]()
- [https://free3d.com]()

2. Check model with Open model in [Google Model Viewer](https://modelviewer.dev/editor/)

2. Add animation with Mixamo
- Open Mixamo web site: [https://www.mixamo.com]()
- Upload your character `human_knight.fbx`
- Chose several animations: Idle, Walk, Dance, Dying
- Save character model with animations

NOTE: When dowload animation check without skin option
![](docs/mixamo_download.png)

3. Mix in a Blender all downloaded animations
- Import all gbx files with animations
- Rename animation clip to appropriate action name
- Add textures to a character
- Export to all the single glTF format
![](docs/export.png)
![](docs/export-include.png)
![](docs/export-transform.png)
![](docs/export-animation.png)

## Task -- Play animation clip
1. Create AnimationMixer object
2. For AnimationMixer object create AnimationClip 
3. For AnimationClip create AnimationClip
4. With AnimationClip control AnimationAction
5. Call AnimationMixer `update()` method from renderer loop
