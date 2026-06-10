document.addEventListener('DOMContentLoaded', function() {
	loadMainData();
});

async function loadMainData() {
	const loading = document.getElementById('loading');

	try {
		await Promise.all([
			loadSiteProfile(),
			loadFeaturedPosts('FEATURED_IMAGE', 'photoSlider', false),
			loadFeaturedPosts('FEATURED_VIDEO', 'videoSlider', true)
		]);

		startAutoSliders();
	} catch (error) {
		console.error('메인 데이터 로딩 오류:', error);
	} finally {
		if (loading) {
			loading.classList.add('hide');
		}
	}
}

async function loadSiteProfile() {
	const { data, error } = await db
		.from('site_profiles')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		console.error('작가 정보 조회 오류:', error);
		return;
	}

	if (!data) {
		return;
	}

	setText('artistName', data.artist_name);
	setText('artistTitle', data.artist_title);
	setText('artistMessage', data.artist_message);
	setText('artistPhone', data.phone);

	const artistEmail = document.getElementById('artistEmail');
	const artistInstagram = document.getElementById('artistInstagram');

	if (artistEmail) {
		artistEmail.innerHTML = data.email ? `<a href="mailto:${escapeAttr(data.email)}">${escapeHtml(data.email)}</a>` : '';
	}

	if (artistInstagram) {
		artistInstagram.innerHTML = data.instagram_url ? `<a href="${escapeAttr(data.instagram_url)}" target="_blank" rel="noopener noreferrer">Instagram</a>` : '';
	}
}

async function loadFeaturedPosts(boardCode, sliderId, isVideo) {
	const slider = document.getElementById(sliderId);

	if (!slider) {
		return;
	}

	const board = await getBoardByCode(boardCode);

	if (!board) {
		renderEmptySlider(slider);
		return;
	}

	const posts = await getPostsByBoardId(board.id);

	if (!posts || posts.length === 0) {
		renderEmptySlider(slider);
		return;
	}

	slider.classList.remove('is-empty');
	slider.innerHTML = '';

	posts.forEach(function(post) {
		const html = isVideo ? renderVideoSlide(post) : renderImageSlide(post);

		if (html) {
			slider.insertAdjacentHTML('beforeend', html);
		}
	});

	if (!slider.querySelector('.slide-card')) {
		renderEmptySlider(slider);
	}
}

function renderImageSlide(post) {
	const firstItem = post.post_items && post.post_items.length > 0 ? post.post_items[0] : null;
	const thumbnailUrl = getPostThumbnail(post, firstItem, false);

	if (!thumbnailUrl) {
		return '';
	}

	return `
		<div class="slide-card" onclick="location.href='detail.html?id=${post.id}'">
			<div class="slide-image">
				<img src="${escapeAttr(thumbnailUrl)}" alt="${escapeAttr(post.title || '')}">
				<div class="slide-info">
					<span>${escapeHtml(post.title || '')}</span>
					<span>Photo</span>
				</div>
			</div>
		</div>
	`;
}

function renderVideoSlide(post) {
	const firstItem = post.post_items && post.post_items.length > 0 ? post.post_items[0] : null;
	const youtubeId = firstItem ? (firstItem.youtube_id || extractYoutubeId(firstItem.video_url)) : '';

	if (!youtubeId) {
		return '';
	}

	return `
		<div class="slide-card video-click-card" onclick="location.href='detail.html?id=${post.id}'">
			<div class="slide-image">
				<iframe class="video-embed" src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(post.title || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
				<div class="video-click-cover"></div>
				<div class="slide-info">
					<span>${escapeHtml(post.title || '')}</span>
					<span>Video</span>
				</div>
			</div>
		</div>
	`;
}

async function getBoardByCode(boardCode) {
	const { data, error } = await db
		.from('boards')
		.select('id, board_code')
		.eq('board_code', boardCode)
		.eq('is_visible', true)
		.maybeSingle();

	if (error) {
		console.error(`${boardCode} 게시판 조회 오류:`, error);
		return null;
	}

	return data;
}

async function getPostsByBoardId(boardId) {
	const { data, error } = await db
		.from('posts')
		.select(`
			id,
			board_id,
			title,
			caption,
			description,
			thumbnail_url,
			sort_order,
			is_visible,
			category_code,
			created_at,
			post_items (
				id,
				item_type,
				image_url,
				video_url,
				youtube_id,
				caption,
				description,
				sort_order,
				is_visible
			)
		`)
		.eq('board_id', boardId)
		.eq('is_visible', true)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: false });

	if (error) {
		console.error('대표 게시글 조회 오류:', error);
		return [];
	}

	return (data || []).map(function(post) {
		post.post_items = (post.post_items || [])
			.filter(function(item) {
				return item.is_visible === true;
			})
			.sort(function(a, b) {
				return (a.sort_order || 0) - (b.sort_order || 0);
			});

		return post;
	});
}

function getPostThumbnail(post, firstItem, isVideo) {
	if (post.thumbnail_url && !isVideo) {
		return post.thumbnail_url;
	}

	if (!firstItem) {
		return '';
	}

	if (!isVideo && firstItem.image_url) {
		return firstItem.image_url;
	}

	return '';
}

function extractYoutubeId(url) {
	if (!url) {
		return '';
	}

	const patterns = [
		/youtu\.be\/([^?&]+)/,
		/youtube\.com\/watch\?v=([^?&]+)/,
		/youtube\.com\/embed\/([^?&]+)/,
		/youtube\.com\/shorts\/([^?&]+)/
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);

		if (match && match[1]) {
			return match[1];
		}
	}

	return '';
}

function renderEmptySlider(slider) {
	slider.classList.add('is-empty');
	slider.innerHTML = '';
}

function setText(id, value) {
	const element = document.getElementById(id);

	if (element) {
		element.textContent = value || '';
	}
}

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function escapeAttr(value) {
	return escapeHtml(value);
}
