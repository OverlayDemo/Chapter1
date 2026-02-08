/* features/gestures.js - Plugin for Swipe Control */

window.JewelsGestures = (function() {
    
    // Internal State
    let lastWristX = 0;
    let swipeCooldown = 0;
    const SWIPE_THRESHOLD = 0.04; 

    function detect(lm) {
        const now = Date.now();
        // 1. Cooldown
        if (now - swipeCooldown < 500) return;

        // 2. Wrist Tracking
        const currentWristX = lm[0].x;

        // 3. Velocity Check
        if (lastWristX !== 0) {
            const diff = currentWristX - lastWristX;

            // Swipe Logic
            if (diff > SWIPE_THRESHOLD) { 
                console.log("Gesture: Previous");
                // Uses the function exposed by core.js
                if(window.showToast) window.showToast("⬅️ Previous Look");
                if(window.changeProduct) window.changeProduct(-1);
                swipeCooldown = now;
            }

            if (diff < -SWIPE_THRESHOLD) { 
                console.log("Gesture: Next");
                if(window.showToast) window.showToast("➡️ Next Look");
                if(window.changeProduct) window.changeProduct(1);
                swipeCooldown = now;
            }
        }
        lastWristX = currentWristX;
    }

    // Expose only the detect function
    return {
        detect: detect
    };
})();