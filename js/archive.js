document.addEventListener('DOMContentLoaded', function() {
	initCommonUi();
	loadArchiveData();
});

function initCommonUi() {
	const menuBtn = document.getElementById('menuBtn');
	const nav = document.getElementById('nav');
	const year = document.getElementById('year');

	if (menuBtn && nav) {
		menuBtn.addEventListener('click', function() {
			nav.classList.toggle('active');
		});

		nav.querySelectorAll('a').forEach(function(link) {
			link.addEventListener('click', function() {
				nav.classList.remove('active');
			});
		});
	}

	if (year) {
		year.textContent = new Date().getFullYear();
	}
}

async function loadArchiveData() {
	const body = document.body;
	const boardCode = body.dataset.boardCode;
	const pageTitle = body.dataset.pageTitle || '';
	const pageDesc = body.dataset.pageDesc || '';
	const archiveTitle = document.getElementById('archiveTitle');
	const archiveDesc = document.getElementById('archiveDesc');
	const archiveList = document.getElementById('archiveList');
	const loading = document.getElementById('loading');

	if (archiveTitle) {
		archiveTitle.textContent = pageTitle;
	}

	if (archiveDesc) {
		archiveDesc.textContent = pageDesc;
	}

	if (!boardCode || !archiveList) {
		hideLoading(loading);
		return;
	}

	try {
		const board = await getBoardByCode(boardCode);

		if (!board) {
			renderEmpty(archiveList, '게시판 정보를 찾을 수 없습니다.');
			return;
		}

		const posts = await getPostsByBoardId(board.id);
		renderArchiveList(archiveList, posts, boardCode);
	} catch (error) {
		console.error('목록 데이터 로딩 오류:', error);
		renderEmpty(archiveList, '데이터를 불러오는 중 오류가 발생했습니다.');
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

function renderArchiveList(target, posts, boardCode) {
	target.innerHTML = '';

	if (!posts || posts.length === 0) {
		renderEmpty(target, '등록된 게시글이 없습니다.');
		return;
	}

	const isVideo = boardCode === 'VIDEO_ARCHIVE';

	posts.forEach(function(post) {
		const firstItem = post.post_items && post.post_items.length > 0 ? post.post_items[0] : null;
		const thumbnailUrl = getPostThumbnail(post, firstItem, isVideo);
		const categoryName = getCategoryName(post.category_code);

		target.insertAdjacentHTML('beforeend', `
			<a href="detail.html?id=${post.id}" class="archive-card">
				<div class="archive-thumb-wrap">
					${thumbnailUrl ? `<img src="${escapeAttr(thumbnailUrl)}" alt="${escapeAttr(post.title || '')}" class="archive-thumb" />` : `<div class="empty-box">썸네일이 없습니다.</div>`}
					${isVideo ? `<span class="play-icon" aria-hidden="true"></span>` : ''}
				</div>
				<div class="archive-info">
					${categoryName ? `<span class="archive-category">${escapeHtml(categoryName)}</span>` : ''}
					<h2 class="archive-card-title">${escapeHtml(post.title || '')}</h2>
					${post.caption ? `<p class="archive-caption">${escapeHtml(post.caption)}</p>` : ''}
				</div>
			</a>
		`);
	});
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

function getCategoryName(categoryCode) {
	const categories = {
		'performance': 'Performance',
		'exhibition': 'Exhibition',
		'festival-event': 'Festival / Event',
		'interview': 'Interview'
	};

	return categories[categoryCode] || '';
}

function renderEmpty(target, message) {
	target.innerHTML = `
		<div class="empty-box">
			${escapeHtml(message)}
		</div>
	`;
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
