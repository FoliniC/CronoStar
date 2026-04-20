// Ensures CronoStar appears in the card picker with a static PNG instead of a live preview
(function () {
    try {
        window.customCards = window.customCards || [];
        const type = 'cronostar-card';
        const idx = window.customCards.findIndex((c) => c.type === type || c.type === 'custom:cronostar-card');
        const meta = {
            type: 'cronostar-card',
            name: '🌟 CronoStar Card',
            description: 'Visual hourly schedule editor with drag-and-drop control',
            preview: true,
            preview_image: '/cronostar_card/cronostar-preview.png',
            thumbnail: '/cronostar_card/cronostar-logo.png',
            documentationURL: 'https://github.com/FoliniC/cronostar_card'
        };
        if (idx === -1) {
            window.customCards.push(meta);
        } else {
            window.customCards[idx] = meta;
        }
        // Also patch any existing entry for 'custom:cronostar-card'
        const idx2 = window.customCards.findIndex((c) => c.type === 'custom:cronostar-card');
        if (idx2 !== -1) {
            window.customCards[idx2] = meta;
        }
        console.debug('[CronoStar] card-picker-metadata applied');
    } catch (e) {
        console.warn('[CronoStar] Unable to set card picker metadata:', e);
    }
})();