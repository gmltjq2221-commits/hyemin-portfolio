document.addEventListener('DOMContentLoaded', function() {
	loadMainData();
});

async function loadMainData() {
	const loading = document.getElementById('loading');

	try {
		await Promise.all([
			loadSiteProfile(),
			loadFeaturedImage(),
			loadFeaturedVideo()
		]);
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

	const heroText = document.getElementById('heroText');
	const artistName = document.getElementById('artistName');
	const artistTitle = document.getElementById('artistTitle');
	const artistMessage = document.getElementById('artistMessage');
	const profileImage = document.getElementById('profileImage');
	const profileEmpty = document.getElementById('profileEmpty');
	const aboutContact = document.getElementById('aboutContact');
	const footerArtist = document.getElementById('footerArtist');

	if (heroText) {
		heroText.textContent = data.artist_title || '';
	}

	if (artistName) {
		artistName.textContent = data.artist_name || '';
	}

	if (artistTitle) {
		artistTitle.textContent = data.artist_title || '';
	}

	if (artistMessage) {
		artistMessage.textContent = data.artist_message || '';
	}

	if (footerArtist) {
		footerArtist.textContent = data.artist_name || '';
	}

	if (profileImage && data.profile_image_url) {
		profileImage.src = data.profile_image_url;
		profileImage.alt = data.artist_name || '프로필 이미지';
		profileImage.style.display = 'block';

		if (profileEmpty) {
			profileEmpty.style.display = 'none';
		}
	}

	if (aboutContact) {
		aboutContact.innerHTML = '';

		if (data.email) {
			aboutContact.insertAdjacentHTML('beforeend', `
				<a href="mailto:${escapeAttr(data.email)}">${escapeHtml(data.email)}</a>
			`);
		}

		if (data.instagram_url) {
			aboutContact.insertAdjacentHTML('beforeend', `
				<a href="${escapeAttr(data.instagram_url)}" target="_blank" rel="noopener noreferrer">Instagram</a>
			`);
		}

		if (data.phone) {
			aboutContact.insertAdjacentHTML('beforeend', `
				<span>${escapeHtml(data.phone)}</span>
			`);
		}
	}
}

async function loadFeaturedImage() {
	const post = await getLatestVisiblePostByBoardCode('FEATURED_IMAGE');

	if (!post) {
		return;
	}

	renderFeaturedCard({
		cardId: 'featuredImageCard',
		post: post,
		typeLabel: 'Image',
		isVideo: false
	});
}

async function loadFeaturedVideo() {
	const post = await getLatestVisiblePostByBoardCode('FEATURED_VIDEO');

	if (!post) {
		return;
	}

	renderFeaturedCard({
		cardId: 'featuredVideoCard',
		post: post,
		typeLabel: 'Video',
		isVideo: true
	});
}

async function getLatestVisiblePostByBoardCode(boardCode) {
	const { data: board, error: boardError } = await db
		.from('boards')
		.select('id, board_code')
		.eq('board_code', boardCode)
		.eq('is_visible', true)
		.maybeSingle();

	if (boardError) {
		console.error(`${boardCode} 게시판 조회 오류:`, boardError);
		return null;
	}

	if (!board) {
		return null;
	}

	const { data: post, error: postError } = await db
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
		.eq('board_id', board.id)
		.eq('is_visible', true)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (postError) {
		console.error(`${boardCode} 게시글 조회 오류:`, postError);
		return null;
	}

	if (!post) {
		return null;
	}

	post.post_items = (post.post_items || [])
		.filter(function(item) {
			return item.is_visible === true;
		})
		.sort(function(a, b) {
			return (a.sort_order || 0) - (b.sort_order || 0);
		});

	return post;
}

function renderFeaturedCard(options) {
	const card = document.getElementById(options.cardId);

	if (!card || !options.post) {
		return;
	}

	const post = options.post;
	const firstItem = post.post_items && post.post_items.length > 0 ? post.post_items[0] : null;
	const thumbnailUrl = getPostThumbnail(post, firstItem, options.isVideo);

	card.classList.remove('is-empty');
	card.href = `detail.html?id=${post.id}`;

	card.innerHTML = `
		${thumbnailUrl ? `<img src="${escapeAttr(thumbnailUrl)}" alt="${escapeAttr(post.title || '')}" class="feature-thumb" />` : `<div class="empty-box">썸네일이 등록되지 않았습니다.</div>`}
		<div class="feature-dim"></div>
		${options.isVideo ? `<span class="play-icon" aria-hidden="true"></span>` : ''}
		<div class="feature-info">
			<span class="feature-type">${escapeHtml(options.typeLabel)}</span>
			<h3 class="feature-title">${escapeHtml(post.title || '')}</h3>
			${post.caption ? `<p class="feature-caption">${escapeHtml(post.caption)}</p>` : ''}
		</div>
	`;
}

function getPostThumbnail(post, firstItem, isVideo) {
	if (post.thumbnail_url) {
		return post.thumbnail_url;
	}

	if (!firstItem) {
		return '';
	}

	if (!isVideo && firstItem.image_url) {
		return firstItem.image_url;
	}

	if (isVideo && firstItem.youtube_id) {
		return `https://img.youtube.com/vi/${firstItem.youtube_id}/maxresdefault.jpg`;
	}

	if (isVideo && firstItem.video_url) {
		const youtubeId = extractYoutubeId(firstItem.video_url);

		if (youtubeId) {
			return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
		}
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
