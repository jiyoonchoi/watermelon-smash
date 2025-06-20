import React, { useState, useEffect, useCallback, useRef } from 'react';

const GAME_WIDTH = 450;
const GAME_HEIGHT = 600;

// Updated fruit types with pixel art images (all 50px) - paths updated for fruits directory
const FRUITS = [
  { name: 'Grape', size: 20, color: '#8b5cf6', points: 1, density: 0.0008, restitution: 0.6, friction: 0.4, image: '/fruits/grape.png' },
  { name: 'Blueberry', size: 30, color: '#3b82f6', points: 6, density: 0.001, restitution: 0.4, friction: 0.6, image: '/fruits/blueberry.png' },
  { name: 'Guava', size: 40, color: '#10b981', points: 10, density: 0.0012, restitution: 0.4, friction: 0.7, image: '/fruits/guava.png' },
  { name: 'Banana', size: 50, color: '#fbbf24', points: 3, density: 0.0009, restitution: 0.5, friction: 0.5, image: '/fruits/banana.png' },
  { name: 'Orange', size: 60, color: '#f97316', points: 15, density: 0.0013, restitution: 0.3, friction: 0.7, image: '/fruits/orange.png' },
  { name: 'Apple', size: 80, color: '#ef4444', points: 21, density: 0.0014, restitution: 0.3, friction: 0.8, image: '/fruits/apple.png' },
  { name: 'Peach', size: 100, color: '#f472b6', points: 28, density: 0.0015, restitution: 0.25, friction: 0.8, image: '/fruits/peach.png' },
  { name: 'Pineapple', size: 130, color: '#eab308', points: 36, density: 0.0016, restitution: 0.2, friction: 0.9, image: '/fruits/pineapple.png' },
  { name: 'Watermelon', size: 160, color: '#22c55e', points: 45, density: 0.0018, restitution: 0.15, friction: 0.9, image: '/fruits/watermelon.png' }
];

let nextId = 0;

// Matter.js setup
let Matter;
let Tone;
let engine, world;
let bodies = new Map(); // Map to track Matter bodies to React state

// Initialize Matter.js
const initMatter = async () => {
  if (!Matter) {
    // Load Matter.js from CDN
    Matter = await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js';
      script.onload = () => resolve(window.Matter);
      document.head.appendChild(script);
    });
  }
  
  engine = Matter.Engine.create();
  world = engine.world;
  
  // Configure physics for better performance
  engine.world.gravity.y = 1;
  engine.positionIterations = 3;
  engine.velocityIterations = 2;
  engine.constraintIterations = 1;
  
  // Create boundaries
  const wallThickness = 20;
  const ground = Matter.Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + wallThickness / 2, GAME_WIDTH, wallThickness, { isStatic: true });
  const leftWall = Matter.Bodies.rectangle(-wallThickness / 2, GAME_HEIGHT / 2, wallThickness, GAME_HEIGHT, { isStatic: true });
  const rightWall = Matter.Bodies.rectangle(GAME_WIDTH + wallThickness / 2, GAME_HEIGHT / 2, wallThickness, GAME_HEIGHT, { isStatic: true });
  
  Matter.World.add(world, [ground, leftWall, rightWall]);
  
  return { Matter, engine, world };
};

// Initialize Tone.js
const initTone = async () => {
  if (!Tone) {
    Tone = await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';
      script.onload = () => resolve(window.Tone);
      document.head.appendChild(script);
    });
  }
  return Tone;
};

export default function WatermelonMergeGame() {
  const [fruits, setFruits] = useState([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(GAME_WIDTH / 2);
  const [nextFruitType, setNextFruitType] = useState(0);
  const [isDropping, setIsDropping] = useState(false);
  const [matterLoaded, setMatterLoaded] = useState(false);
  const [maxFruitTypeDropped, setMaxFruitTypeDropped] = useState(0); // Track largest fruit type dropped
  const [particles, setParticles] = useState([]); // For merge animations
  const [audioEnabled, setAudioEnabled] = useState(false); // Track if audio context is started
  
  const animationRef = useRef();
  const gameAreaRef = useRef();
  const engineRef = useRef();
  const worldRef = useRef();
  const bodiesRef = useRef(new Map());
  const pendingMerges = useRef(new Set());
  const particleIdRef = useRef(0);
  const synthRef = useRef(null);
  const toneLoadedRef = useRef(false);

  // Initialize audio
  const initAudio = useCallback(async () => {
    if (!audioEnabled && !toneLoadedRef.current) {
      try {
        await initTone();
        toneLoadedRef.current = true;
        
        if (Tone.context.state !== 'running') {
          await Tone.start();
        }
        
        // Create a simple synth for merge sounds
        synthRef.current = new Tone.Synth({
          oscillator: {
            type: 'sine'
          },
          envelope: {
            attack: 0.01,
            decay: 0.2,
            sustain: 0.1,
            release: 0.3
          }
        }).toDestination();
        
        setAudioEnabled(true);
      } catch (error) {
        console.log('Audio initialization failed:', error);
      }
    }
  }, [audioEnabled]);

  // Play merge sound
  const playMergeSound = useCallback((fruitType) => {
    if (!audioEnabled || !synthRef.current || !toneLoadedRef.current) return;
    
    try {
      // Higher fruit types = higher pitch + more complex sound
      const baseFreq = 200 + (fruitType * 100); // Frequency increases with fruit size
      const duration = 0.3 + (fruitType * 0.1); // Longer duration for bigger fruits
      
      // Play a pleasant chord-like sound
      synthRef.current.triggerAttackRelease(baseFreq, duration);
      
      // Add a harmonic for bigger fruits
      if (fruitType >= 3) {
        setTimeout(() => {
          synthRef.current.triggerAttackRelease(baseFreq * 1.5, duration * 0.7);
        }, 50);
      }
      
      // Add another harmonic for the biggest fruits
      if (fruitType >= 6) {
        setTimeout(() => {
          synthRef.current.triggerAttackRelease(baseFreq * 2, duration * 0.5);
        }, 100);
      }
    } catch (error) {
      console.log('Sound playback failed:', error);
    }
  }, [audioEnabled]);

  // Create particle burst animation
  const createParticleBurst = useCallback((x, y, color, fruitType) => {
    const particleCount = Math.min(8 + fruitType * 2, 16); // More particles for bigger fruits
    const newParticles = [];
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const velocity = 2 + Math.random() * 3; // Random velocity
      const size = 3 + Math.random() * 4; // Random size
      const life = 60 + Math.random() * 30; // 60-90 frames
      
      newParticles.push({
        id: particleIdRef.current++,
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 1, // Slight upward bias
        size: size,
        maxSize: size,
        color: color,
        life: life,
        maxLife: life,
        gravity: 0.1
      });
    }
    
    setParticles(prev => [...prev, ...newParticles]);
  }, []);

  // Update particles animation
  const updateParticles = useCallback(() => {
    setParticles(prev => prev.map(particle => ({
      ...particle,
      x: particle.x + particle.vx,
      y: particle.y + particle.vy,
      vy: particle.vy + particle.gravity,
      vx: particle.vx * 0.98, // Air resistance
      life: particle.life - 1,
      size: particle.maxSize * (particle.life / particle.maxLife) // Shrink over time
    })).filter(particle => particle.life > 0));
  }, []);

  // Generate next fruit type (limited to orange - index 4)
  const generateNextFruit = useCallback(() => {
    const maxAvailable = Math.min(maxFruitTypeDropped, 4); // Cap at orange (index 4)
    return Math.floor(Math.random() * (maxAvailable + 1));
  }, [maxFruitTypeDropped]);

  // Create a new fruit body
  const createFruit = useCallback((x, y, type) => {
    if (!Matter || !worldRef.current) return;

    const fruit = FRUITS[type];
    const radius = fruit.size;
    const fruitId = nextId++;
    
    const body = Matter.Bodies.circle(x, y, radius, {
      restitution: fruit.restitution,
      friction: fruit.friction,
      density: fruit.density,
      frictionAir: 0.005
    });
    
    body.fruitData = { id: fruitId, type, createdAt: Date.now() };
    
    Matter.World.add(worldRef.current, body);
    bodiesRef.current.set(fruitId, body);
    
    return fruitId;
  }, []);

  // Initialize Matter.js
  useEffect(() => {
    initMatter().then(({ Matter: MatterLib, engine: eng, world: w }) => {
      Matter = MatterLib;
      engineRef.current = eng;
      worldRef.current = w;
      setMatterLoaded(true);
      setNextFruitType(0); // Start with smallest fruit
    });

    return () => {
      if (engineRef.current) {
        Matter.Engine.clear(engineRef.current);
      }
    };
  }, []);

  // Handle collisions and merging (optimized)
  const handleCollisions = useCallback(() => {
    if (!engineRef.current || !Matter) return;

    const pairs = engineRef.current.pairs.list;
    const toMerge = [];

    // Limit collision checks for performance
    for (let i = 0; i < Math.min(pairs.length, 50); i++) {
      const pair = pairs[i];
      const { bodyA, bodyB } = pair;
      
      if (bodyA.fruitData && bodyB.fruitData && 
          bodyA.fruitData.type === bodyB.fruitData.type && 
          bodyA.fruitData.type < FRUITS.length - 1 &&
          !pendingMerges.current.has(bodyA.id) &&
          !pendingMerges.current.has(bodyB.id)) {
        
        toMerge.push({ bodyA, bodyB });
        pendingMerges.current.add(bodyA.id);
        pendingMerges.current.add(bodyB.id);
        
        if (toMerge.length >= 3) break; // Limit merges per frame
      }
    }

    if (toMerge.length > 0) {
      toMerge.forEach(({ bodyA, bodyB }) => {
        const newType = bodyA.fruitData.type + 1;
        const x = (bodyA.position.x + bodyB.position.x) / 2;
        const y = (bodyA.position.y + bodyB.position.y) / 2;

        // Create particle burst at merge location
        createParticleBurst(x, y, FRUITS[newType].color, newType);

        // Play merge sound
        playMergeSound(newType);

        // Remove old bodies
        Matter.World.remove(worldRef.current, [bodyA, bodyB]);
        bodiesRef.current.delete(bodyA.fruitData.id);
        bodiesRef.current.delete(bodyB.fruitData.id);

        // Create new merged fruit with slight delay for effect
        setTimeout(() => {
          createFruit(x, y, newType);
        }, 100);
        
        // Update max fruit type dropped if we created a new larger fruit
        setMaxFruitTypeDropped(prev => Math.max(prev, newType));
        
        // Add score
        setScore(prev => prev + FRUITS[newType].points);

        // Clean up pending merges
        setTimeout(() => {
          pendingMerges.current.delete(bodyA.id);
          pendingMerges.current.delete(bodyB.id);
        }, 150);
      });
    }
  }, [createParticleBurst, playMergeSound, createFruit]);

  // Update fruit positions from Matter.js bodies
  const updateFruits = useCallback(() => {
    if (!bodiesRef.current || !Matter) return;

    const newFruits = [];
    bodiesRef.current.forEach((body, id) => {
      if (body.fruitData) {
        newFruits.push({
          id,
          x: body.position.x,
          y: body.position.y,
          type: body.fruitData.type,
          createdAt: body.fruitData.createdAt
        });
      }
    });

    setFruits(newFruits);

    // Check game over condition
    const settledFruits = newFruits.filter(f => {
      const timeSinceCreation = Date.now() - (f.createdAt || 0);
      return timeSinceCreation > 2000;
    });
    const overflowFruits = settledFruits.filter(f => f.y - FRUITS[f.type].size < 50);
    if (overflowFruits.length > 0) {
      setGameOver(true);
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (!matterLoaded || gameOver) return;

    const animate = () => {
      if (engineRef.current) {
        Matter.Engine.update(engineRef.current, 20); // Slightly larger timestep
        handleCollisions();
        updateFruits();
        updateParticles(); // Update particle animations
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [matterLoaded, gameOver, handleCollisions, updateFruits, updateParticles]);

  // Update next fruit type when max fruit type changes
  useEffect(() => {
    if (matterLoaded) {
      setNextFruitType(generateNextFruit());
    }
  }, [maxFruitTypeDropped, generateNextFruit, matterLoaded]);

  // Handle mouse movement
  const handleMouseMove = (e) => {
    if (isDropping || !matterLoaded) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fruitSize = FRUITS[nextFruitType].size;
    setDropPosition(Math.max(fruitSize, Math.min(GAME_WIDTH - fruitSize, x)));
  };

  // Drop fruit
  const dropFruit = async (e) => {
    if (isDropping || gameOver || !matterLoaded) return;
    
    // Initialize audio on first interaction
    if (!audioEnabled) {
      await initAudio();
    }
    
    // Only drop if clicking inside the game area
    const rect = gameAreaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (x < 0 || x > GAME_WIDTH || y < 0 || y > GAME_HEIGHT) {
      return;
    }
    
    setIsDropping(true);
    createFruit(dropPosition, 50, nextFruitType);
    
    // Update max fruit type dropped
    setMaxFruitTypeDropped(prev => Math.max(prev, nextFruitType));
    
    setNextFruitType(generateNextFruit());
    
    setTimeout(() => setIsDropping(false), 500);
  };

  // Reset game
  const resetGame = () => {
    if (worldRef.current && Matter) {
      // Remove all fruit bodies
      bodiesRef.current.forEach(body => {
        Matter.World.remove(worldRef.current, body);
      });
      bodiesRef.current.clear();
    }
    
    setFruits([]);
    setScore(0);
    setGameOver(false);
    setIsDropping(false);
    setMaxFruitTypeDropped(0); // Reset max fruit type
    setNextFruitType(0); // Start with smallest fruit
    setParticles([]); // Clear particles
    pendingMerges.current.clear();
  };

  // Calculate preview size (fixed at 50px for pixel art)
  const getPreviewSize = (fruitType) => {
    return 50; // All pixel art images are 50px
  };

  if (!matterLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading physics engine...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-green-100 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-center mb-4 text-gray-800">
          watermelon smash
        </h1>
        
        <div className="flex justify-between items-center mb-4">
          <div className="text-xl font-semibold">Score: {score}</div>
          <div className="flex items-center gap-2">
            <span>Next:</span>
            <div 
              className="rounded-full border-2 border-gray-300 flex items-center justify-center overflow-hidden"
              style={{
                width: getPreviewSize(nextFruitType),
                height: getPreviewSize(nextFruitType),
                backgroundColor: 'transparent'
              }}
            >
              <img 
                src={FRUITS[nextFruitType].image}
                alt={FRUITS[nextFruitType].name}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  imageRendering: 'pixelated'
                }}
              />
            </div>
          </div>
          <button 
            onClick={resetGame}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="relative mx-auto" style={{ width: GAME_WIDTH }}>
          {/* Drop line indicator */}
          {!isDropping && !gameOver && (
            <div 
              className="absolute top-0 w-0.5 h-12 bg-red-400 opacity-50 z-10"
              style={{ left: dropPosition - 1 }}
            />
          )}
          
          {/* Game container */}
          <div
            ref={gameAreaRef}
            className="relative bg-gradient-to-b from-sky-100 to-sky-200 border-4 border-gray-400 cursor-pointer overflow-hidden"
            style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
            onMouseMove={handleMouseMove}
            onClick={dropFruit}
          >
            {/* Game over line */}
            <div 
              className="absolute w-full border-t-2 border-red-400 border-dashed opacity-50"
              style={{ top: 50 }}
            />
            
            {/* Fruits */}
            {fruits.map(fruit => (
              <div
                key={fruit.id}
                className="absolute transition-none flex items-center justify-center overflow-hidden"
                style={{
                  left: fruit.x - FRUITS[fruit.type].size,
                  top: fruit.y - FRUITS[fruit.type].size,
                  width: FRUITS[fruit.type].size * 2,
                  height: FRUITS[fruit.type].size * 2,
                  zIndex: 1
                }}
              >
                <img 
                  src={FRUITS[fruit.type].image}
                  alt={FRUITS[fruit.type].name}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    imageRendering: 'pixelated' // Keep pixel art crisp
                  }}
                />
              </div>
            ))}

            {/* Particle effects */}
            {particles.map(particle => (
              <div
                key={particle.id}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: particle.x - particle.size / 2,
                  top: particle.y - particle.size / 2,
                  width: particle.size,
                  height: particle.size,
                  backgroundColor: particle.color,
                  opacity: particle.life / particle.maxLife,
                  zIndex: 10,
                  boxShadow: `0 0 ${particle.size}px ${particle.color}`,
                  filter: 'brightness(1.2)'
                }}
              />
            ))}
            
            {/* Game over overlay */}
            {gameOver && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg text-center">
                  <h2 className="text-2xl font-bold mb-2">Game Over!</h2>
                  <p className="text-lg mb-4">Final Score: {score}</p>
                  <button 
                    onClick={resetGame}
                    className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="text-center mt-2 text-sm text-gray-600">
            Move mouse to aim, click to drop fruit
            {!audioEnabled && <div className="text-xs text-gray-500 mt-1">Click to enable sound effects!</div>}
          </div>
        </div>
        
        {/* Fruit progression chart */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600 mb-2">Fruit Evolution Chart:</p>
          <div className="flex justify-center items-center gap-1 mb-2">
            {/* Fruits */}
            {FRUITS.map((fruit, index) => (
              <div key={index} className="flex flex-col items-center">
                <div 
                  className="border border-gray-300 flex items-center justify-center overflow-hidden"
                  style={{
                    width: 30,
                    height: 30
                  }}
                >
                  <img 
                    src={fruit.image}
                    alt={fruit.name}
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'contain',
                      imageRendering: 'pixelated'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            <p>Drop identical fruits to merge!</p>
          </div>
        </div>
      </div>
    </div>
  );
}