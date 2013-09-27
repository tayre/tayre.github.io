var camera, scene, renderer;

$(document).ready(function(){
    
	if(window.WebGLRenderingContext) {
		init();
		animate();
		//$(document).bind("mousemove touchmove", mouseMove);
	}
	
});

function mouseMove(event){

    var halfWidth = $(window).width() / 2;
    var halfHeight = $(window).height() / 2;
    
    var xPos = event.pageX - halfWidth;
    var yPos = event.pageY - halfHeight;
    cube.rotation.x = (yPos/halfHeight* Math.PI)*2 % Math.PI;
}

function init(){

    var WIDTH = 100, HEIGHT = 100;
    var CUBE_DEPTH = 10;
    var CUBE_WIDTH = 10;
    var CUBE_HEIGHT = 10;
    
    var VIEW_ANGLE = 35, ASPECT = WIDTH / HEIGHT, NEAR = 0.1, FAR = 10000;
    
    var $container = $('#mainArea');
    
    renderer = new THREE.WebGLRenderer();
    
    camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
    
    scene = new THREE.Scene();
    
    scene.add(camera);
    
    camera.position.z = 70;
    
    renderer.setSize(WIDTH, HEIGHT);
    
    $container.append(renderer.domElement);
    
    var cubeMaterial = new THREE.MeshLambertMaterial({
        color: 0x33A31F,
        wireframe: false,
        opacity: .75
    });
    
    
    cube = new THREE.Mesh(new THREE.CubeGeometry(CUBE_WIDTH, CUBE_HEIGHT, CUBE_DEPTH, 1, 1, 1, cubeMaterial), new THREE.MeshFaceMaterial());

     
    scene.add(cube);

    pointLight = new THREE.PointLight(0x00FF00);
    
    pointLight.position.x = 30;
    pointLight.position.y = 60;
    pointLight.position.z = 90;
    
    scene.add(pointLight);
}

function animate(){
    
    cube.rotation.x += 0.02;
    cube.rotation.y += 0.02;
    
    renderer.render(scene, camera);
    
    requestAnimationFrame(animate);
}
