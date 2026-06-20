document.addEventListener('DOMContentLoaded', function() {
	loadMainData();
});

async function loadMainData() {
	const loading = document.getElementById('loading');

	try {
		await Promise.all([
			loadSiteProfile(),
			loadFeaturedPosts('IMAGE_ARCHIVE', 'photoSlider', false),
			loadFeaturedPosts('VIDEO_ARCHIVE', 'videoSlider', true)
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

	const aboutText = document.getElementById('aboutText');
	const artistMessage = document.getElementById('artistMessage');
	const aboutInfo = document.getElementById('aboutInfo');

	if (artistMessage) {
		artistMessage.textContent = data.artist_message || '';
	}

	if (aboutText && !data.artist_message) {
		aboutText.style.display = 'none';
	}

	if (!aboutInfo) {
		return;
	}

	aboutInfo.innerHTML = '';

	appendInfoRow(aboutInfo, 'Name', data.artist_name);
	appendInfoRow(aboutInfo, 'Title', data.artist_title);
	appendInfoRow(aboutInfo, 'Email', data.email, data.email ? `mailto:${data.email}` : '');
	appendInfoRow(aboutInfo, 'Instagram', data.instagram_url ? 'Instagram' : '', data.instagram_url);
	appendInfoRow(aboutInfo, 'Phone', data.phone);
	appendInfoRow(aboutInfo, 'Category', 'Photo / Video');

	if (aboutInfo.children.length === 0) {
		aboutInfo.style.display = 'none';
	}
}

function appendInfoRow(target, label, value, link) {
	if (!target || !value) {
		return;
	}

	const safeLabel = escapeHtml(label);
	const safeValue = escapeHtml(value);
	const safeLink = link ? escapeAttr(link) : '';

	target.insertAdjacentHTML('beforeend', `
		<div class="info-row">
			<strong>${safeLabel}</strong>
			<span>
				${safeLink ? `<a href="${safeLink}" target="${safeLink.startsWith('mailto:') ? '_self' : '_blank'}" rel="noopener noreferrer">${safeValue}</a>` : safeValue}
			</span>
		</div>
	`);
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
	const firstItem = getFirstVideoItem(post);
	const youtubeId = firstItem ? (firstItem.youtube_id || extractYoutubeId(firstItem.video_url)) : '';

	if (!youtubeId) {
		return '';
	}

	const thumbUrl = `https://img.youtube.com/vi/${escapeAttr(youtubeId)}/hqdefault.jpg`;
	const moveUrl = `videos.html?post=${encodeURIComponent(post.id)}&video=${encodeURIComponent(youtubeId)}`;

	return `
		<div class="slide-card video-click-card" onclick="location.href='${moveUrl}'">
			<div class="slide-image">
				<img src="${thumbUrl}" alt="${escapeAttr(post.title || 'YouTube video')}">
				<span class="play-button">▶</span>

				<div class="slide-info">
					<span>${escapeHtml(post.title || '')}</span>
					<span>Video</span>
				</div>
			</div>
		</div>
	`;
}

function getFirstVideoItem(post) {
	if (!post.post_items || post.post_items.length === 0) {
		return null;
	}

	return post.post_items.find(function(item) {
		return item.item_type === 'video' && (item.youtube_id || extractYoutubeId(item.video_url));
	}) || null;
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
			is_featured,
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
		.eq('is_featured', true)
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
