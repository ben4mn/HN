// Dark mode toggle
(function() {
    function isDarkMode() {
        var stored = localStorage.getItem('darkMode');
        if (stored !== null) return stored === 'true';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function applyDarkMode(dark) {
        if (dark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (localStorage.getItem('darkMode') === null) {
            applyDarkMode(e.matches);
        }
    });

    document.addEventListener('DOMContentLoaded', function() {
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) {
            toggle.addEventListener('click', function() {
                var nowDark = !document.documentElement.classList.contains('dark');
                localStorage.setItem('darkMode', nowDark.toString());
                applyDarkMode(nowDark);
            });
        }
    });
})();
