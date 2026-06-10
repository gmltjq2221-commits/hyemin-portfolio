document.addEventListener('DOMContentLoaded', function() {
	initCommonUi();
	loadArchiveData();
});

function initCommonUi() {
	const menu = document.getElementById('siteMenu');
	const button = document.querySelector('.mobile-menu-btn');
	const year = document.getElementById('year');

	if (year) {
		year.textContent = new Date().getFullYear();
	}

	document.addEventListener('click', function(event) {
		if (!event.target.closest('header')) {
			closeMobileMenu();
		}
	});

	if (menu) {
		menu.querySelectorAll('a').forEach(function(link) {
			link.addEventListener('click', closeMobileMenu);
		});
	}

	document.addEventListener('keydown', function(event) {
		if (event.key === 'Escape') {
			closeMobileMenu();
		}
	});
}

function toggleMobileMenu(event) {
	event.stopPropagation();

	const menu = document.getElementById('siteMenu');
	const button = document.querySelector('.mobile-menu-btn');

	if (!menu || !button) {
		return;
	}

	const isOpen = menu.classList.toggle('open');

	button.classList.toggle('open', isOpen);
	button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	button.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
}

function closeMobileMenu() {
	const menu = document.getElementById('siteMenu');
	const button = document.querySelector('.mobile-menu-btn');

	if (!menu || !button) {
		return;
	}

	menu.classList.remove('open');
	button.classList.remove('open');
	button.setAttribute('aria-expanded', 'false');
	button.setAttribute('aria-label', '메뉴 열기');
}

async function loadArchiveData() {
	const boardCode = document.body.dataset.boardCode;
	const pageKind = document.body.dataset.pageKind;
	const archiveList = document.getElementById('archiveList');
	const loading = document.getElementById('loading');

	if (!boardCode || !archiveList) {
		hideLoading(loading);
		return;
	}

	try {
		const board = await getBoardByCode(boardCode);

		if (!board) {
			archiveList.innerHTML = '';
			return;
		}

		const posts = await getPostsByBoardId(board.id);

		if (pageKind === 'video') {
			renderVideoList(archiveList, posts);
		} else {
			renderImageList(archiveList, posts);
		}
	} catch (error) {
		console.error('목록 데이터 로딩 오류:', error);
		archiveList.innerHTML = '';
	} finally {
		hideLoading(loading);
	}
}

async function getBoardByCode(boardCode) {
	const { data, error } = await db
		.from('boards')
		.select('id, board_code, board_name, board_type')
		.eq('board_code', boardCode)
		.eq('is_visible', true)
		.maybeSingle();

	if (error) {
		console.error('게시판 조회 오류:', error);
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
		console.error('게시글 목록 조회 오류:', error);
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

function renderImageList(target, posts) {
	target.innerHTML = '';

	(posts || []).forEach(function(post) {
		const firstItem = post.post_items && post.post_items.length > 0 ? post.post_items[0] : null;
		const thumbnailUrl = post.thumbnail_url || (firstItem ? firstItem.image_url : '');

		if (!thumbnailUrl) {
			return;
		}

		target.insertAdjacentHTML('beforeend', `
			<a href="detail.html?id=${post.id}" class="image-item" data-title="${escapeAttr(post.title || '')}">
				<img src="${escapeAttr(thumbnailUrl)}" alt="${escapeAttr(post.title || '')}">
			</a>
		`);
	});
}

function renderVideoList(target, posts) {
	target.innerHTML = '';

	(posts || []).forEach(function(post) {
		const firstItem = post.post_items && post.post_items.length > 0 ? post.post_items[0] : null;
		const youtubeId = firstItem ? (firstItem.youtube_id || extractYoutubeId(firstItem.video_url)) : '';

		if (!youtubeId) {
			return;
		}

		target.insertAdjacentHTML('beforeend', `
			<a href="detail.html?id=${post.id}" class="video-card">
				<div class="video-thumb">
					<iframe class="video-embed" src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(post.title || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
					<div class="video-click-cover"></div>
				</div>
				<div class="video-info">
					<h2 class="video-title">${escapeHtml(post.title || '')}</h2>
					${post.caption ? `<p class="video-desc">${escapeHtml(post.caption)}</p>` : ''}
				</div>
			</a>
		`);
	});
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

function hideLoading(loading) {
	if (loading) {
		loading.classList.add('hide');
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
