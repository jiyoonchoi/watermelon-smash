import React, { useState, useEffect, useCallback, useRef } from 'react';

const GAME_WIDTH = 450;
const GAME_HEIGHT = 600;

// Fruit types with smaller sizes, colors, and physics properties
const FRUITS = [
  { name: 'Cherry', size: 10, color: '#ff6b6b', points: 1, density: 0.0008, restitution: 0.6, friction: 0.4 },
  { name: 'Strawberry', size: 16, color: '#ff8e8e', points: 3, density: 0.0009, restitution: 0.5, friction: 0.5 },
  { name: 'Grape', size: 25, color: '#9c88ff', points: 6, density: 0.001, restitution: 0.4, friction: 0.6 },
  { name: 'Orange', size: 40, color: '#ffa94d', points: 10, density: 0.0012, restitution: 0.4, friction: 0.7 },
  { name: 'Apple', size: 64, color: '#69db7c', points: 15, density: 0.0013, restitution: 0.3, friction: 0.7 },
  { name: 'Pear', size: 102, color: '#51cf66', points: 21, density: 0.0014, restitution: 0.3, friction: 0.8 },
  { name: 'Peach', size: 163, color: '#ffb3ba', points: 28, density: 0.0015, restitution: 0.25, friction: 0.8 },
  { name: 'Pineapple', size: 200, color: '#ffdfba', points: 36, density: 0.0016, restitution: 0.2, friction: 0.9 },
  { name: 'Watermelon', size: 300, color: '#51cf66', points: 55, density: 0.002, restitution: 0.1, friction: 1.0 }
];

let nextId = 0;

// Matter.js setup
let Matter;
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

export default function WatermelonMergeGame() {
  const [fruits, setFruits] = useState([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(GAME_WIDTH / 2);
  const [nextFruitType, setNextFruitType] = useState(0);
  const [isDropping, setIsDropping] = useState(false);
  const [matterLoaded, setMatterLoaded] = useState(false);
  const [maxFruitTypeDropped, setMaxFruitTypeDropped] = useState(0); // Track largest fruit type dropped
  
  const animationRef = useRef();
  const gameAreaRef = useRef();
  const engineRef = useRef();
  const worldRef = useRef();
  const bodiesRef = useRef(new Map());
  const pendingMerges = useRef(new Set());

  // Generate next fruit type (limited by max fruit type dropped)
  const generateNextFruit = useCallback(() => {
    const maxAvailable = Math.min(maxFruitTypeDropped, 4); // Cap at first 5 types (0-4)
    return Math.floor(Math.random() * (maxAvailable + 1));
  }, [maxFruitTypeDropped]);

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

        // Remove old bodies
        Matter.World.remove(worldRef.current, [bodyA, bodyB]);
        bodiesRef.current.delete(bodyA.fruitData.id);
        bodiesRef.current.delete(bodyB.fruitData.id);

        // Create new merged fruit
        createFruit(x, y, newType);
        
        // Update max fruit type dropped if we created a new larger fruit
        setMaxFruitTypeDropped(prev => Math.max(prev, newType));
        
        // Add score
        setScore(prev => prev + FRUITS[newType].points);

        // Clean up pending merges
        setTimeout(() => {
          pendingMerges.current.delete(bodyA.id);
          pendingMerges.current.delete(bodyB.id);
        }, 50);
      });
    }
  }, []);

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
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [matterLoaded, gameOver, handleCollisions, updateFruits]);

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
  const dropFruit = (e) => {
    if (isDropping || gameOver || !matterLoaded) return;
    
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
    pendingMerges.current.clear();
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
          🍉 Watermelon Merge Game
        </h1>
        
        <div className="flex justify-between items-center mb-4">
          <div className="text-xl font-semibold">Score: {score}</div>
          <div className="flex items-center gap-2">
            <span>Next:</span>
            <div 
              className="rounded-full border-2 border-gray-300 flex items-center justify-center text-xs font-bold text-white"
              style={{
                width: FRUITS[2].size * 2, // Always grape size (index 2)
                height: FRUITS[2].size * 2, // Always grape size (index 2)
                backgroundColor: FRUITS[nextFruitType].color
              }}
            >
              {FRUITS[nextFruitType].name.slice(0, 2)}
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
                className="absolute rounded-full border border-gray-300 transition-none flex items-center justify-center"
                style={{
                  left: fruit.x - FRUITS[fruit.type].size,
                  top: fruit.y - FRUITS[fruit.type].size,
                  width: FRUITS[fruit.type].size * 2,
                  height: FRUITS[fruit.type].size * 2,
                  backgroundColor: FRUITS[fruit.type].color,
                  zIndex: 1
                }}
              >
                <div className="text-xs font-bold text-white" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                  {FRUITS[fruit.type].name.slice(0, 2)}
                </div>
              </div>
            ))}
            
            {/* Game over overlay */}
            {gameOver && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
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
          </div>
        </div>
        
        {/* Instructions */}
        <div className="mt-4 text-sm text-gray-600 text-center">
          <p>Drop identical fruits to merge them into bigger fruits!</p>
          <p>The next fruit will never be larger than your biggest achievement!</p>
          <p>Try to create the ultimate watermelon! 🍉</p>
        </div>
      </div>
    </div>
  );
}