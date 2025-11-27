/**
 * Content script to extract page metadata
 * Called via scripting.executeScript from background.js
 */
(function() {
    function getMetaContent(selectors) {
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const content = el.getAttribute('content') || el.getAttribute('href');
                if (content && content.trim()) {
                    return content.trim();
                }
            }
        }
        return '';
    }

    function getJsonLdData() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
            try {
                const data = JSON.parse(script.textContent);
                // Handle array of objects
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle' ||
                        item['@type'] === 'BlogPosting' || item['@type'] === 'WebPage') {
                        return item;
                    }
                }
            } catch (e) {
                // Invalid JSON, skip
            }
        }
        return null;
    }

    function estimateReadingTime() {
        // Get main content area or fall back to body
        const content = document.querySelector('article, main, .content, .post, #content') || document.body;
        const text = content.innerText || '';
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        // Average reading speed: 200-250 words per minute
        const minutes = Math.ceil(wordCount / 220);
        return minutes > 0 ? minutes : 1;
    }

    // Extract metadata
    const jsonLd = getJsonLdData();

    const metadata = {
        // Meta description - try multiple sources
        description: getMetaContent([
            'meta[name="description"]',
            'meta[property="og:description"]',
            'meta[name="twitter:description"]'
        ]) || (jsonLd && jsonLd.description) || '',

        // Open Graph image
        ogImage: getMetaContent([
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[property="og:image:url"]'
        ]) || (jsonLd && jsonLd.image && (typeof jsonLd.image === 'string' ? jsonLd.image : jsonLd.image.url)) || '',

        // Author
        author: getMetaContent([
            'meta[name="author"]',
            'meta[property="article:author"]',
            'meta[name="twitter:creator"]'
        ]) || (jsonLd && jsonLd.author && (typeof jsonLd.author === 'string' ? jsonLd.author : jsonLd.author.name)) || '',

        // Published date - try multiple sources
        publishedDate: getMetaContent([
            'meta[property="article:published_time"]',
            'meta[name="publication_date"]',
            'meta[name="date"]',
            'time[datetime]'
        ]) || (jsonLd && (jsonLd.datePublished || jsonLd.dateCreated)) || '',

        // Reading time estimate (in minutes)
        readingTime: estimateReadingTime()
    };

    // Clean up the published date to just the date part if it's an ISO string
    if (metadata.publishedDate && metadata.publishedDate.includes('T')) {
        metadata.publishedDate = metadata.publishedDate.split('T')[0];
    }

    return metadata;
})();
