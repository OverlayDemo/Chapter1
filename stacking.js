/* features/stacking.js - Logic for the Mix & Match (∞) Header Icon */

window.JewelsStacking = (function() {
    
    /**
     * Toggles the "Stacking" (Mix & Match) mode.
     * When ON: Switching categories (e.g. Earrings -> Chains) does NOT clear the previous item.
     * When OFF: Switching categories clears previous items (Standard behavior).
     */
    function toggleStacking() {
        // Safety check to ensure core.js is loaded
        if (!window.JewelsState) {
            console.error("JewelsState not found. Make sure core.js is loaded first.");
            return;
        }

        // 1. Toggle the Boolean State
        window.JewelsState.stackingEnabled = !window.JewelsState.stackingEnabled;
        
        // 2. Update the UI (The Top Icon)
        const btn = document.getElementById('stacking-btn');
        
        if (btn) {
            if (window.JewelsState.stackingEnabled) {
                // Add 'active' class to make it Gold (defined in style.css)
                btn.classList.add('active'); 
                if(window.showToast) window.showToast("Mix Mode ON ♾️");
            } else {
                // Remove 'active' class to make it transparent
                btn.classList.remove('active'); 
                if(window.showToast) window.showToast("Mix Mode OFF");
                
                // Note: We do NOT immediately clear items here. 
                // We let them stay until the user switches the category next time.
            }
        }
    }

    // 3. Export the function globally so the HTML onclick="toggleStacking()" works
    window.toggleStacking = toggleStacking;

    return {
        toggle: toggleStacking
    };

})();