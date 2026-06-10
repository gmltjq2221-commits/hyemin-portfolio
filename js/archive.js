document.addEventListener('DOMContentLoaded', function() {
	initCommonUi();
	initVideoModal();
	loadArchiveData();
});

function initCommonUi() {
	const menu = document.getElementById('siteMenu');
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
			closeVideoModal();
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

	const groups = groupPostsByCategory(posts || []);
	const categories = getImageCategories();
	let renderedCount = 0;

	categories.forEach(function(category) {
		const categoryPosts = groups[category.code] || [];

		if (categoryPosts.length === 0) {
			return;
		}

		renderedCount += categoryPosts.length;
		target.insertAdjacentHTML('beforeend', getImageCategoryHtml(category, categoryPosts));
	});

	if (renderedCount === 0) {
		target.innerHTML = '<p class="empty-message">등록된 이미지가 없습니다.</p>';
	}
}

function getImageCategoryHtml(category, posts) {
	return `
		<section class="photo-category" id="${escapeAttr(category.code)}">
			<div class="category-head">
				<h2 class="category-title">${escapeHtml(category.name)}</h2>
			</div>

			<div class="photo-project-list">
				${posts.map(getImageProjectHtml).join('')}
			</div>
		</section>
	`;
}

function getImageProjectHtml(post) {
	const imageItems = (post.post_items || []).filter(function(item) {
		return item.item_type !== 'video' && item.image_url;
	});

	let thumbnailItems = imageItems.length > 0 ? imageItems : getFallbackImageItems(post);

	thumbnailItems = getLimitedImageItems(thumbnailItems);

	if (thumbnailItems.length === 0) {
		return '';
	}

	return `
		<article class="photo-project">
			<a href="detail.html?id=${encodeURIComponent(post.id)}" class="photo-project-title-link">
				<h3 class="photo-project-title">${escapeHtml(post.title || '')}</h3>
				${post.caption ? `<p class="photo-project-caption">${escapeHtml(post.caption)}</p>` : ''}
			</a>

			<div class="photo-strip">
				${thumbnailItems.map(function(item) {
					return `
						<a href="detail.html?id=${encodeURIComponent(post.id)}" class="photo-thumb" aria-label="${escapeAttr(post.title || '')} 상세보기">
							<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || post.title || '')}">
						</a>
					`;
				}).join('')}
			</div>
		</article>
	`;
}

function getLimitedImageItems(items) {
	const count = items.length;

	if (count >= 12) {
		return items.slice(0, 12);
	}

	if (count >= 8) {
		return items.slice(0, 8);
	}

	if (count >= 4) {
		return items.slice(0, 4);
	}

	return items;
}

function getFallbackImageItems(post) {
	if (!post.thumbnail_url) {
		return [];
	}

	return [{
		image_url: post.thumbnail_url,
		caption: post.title || ''
	}];
}

function renderVideoList(target, posts) {
	target.innerHTML = '';

	const videoPosts = (posts || []).filter(function(post) {
		return getVideoItems(post).length > 0;
	});

	if (videoPosts.length === 0) {
		target.innerHTML = '<p class="empty-message dark">등록된 영상이 없습니다.</p>';
		return;
	}

	videoPosts.forEach(function(post) {
		target.insertAdjacentHTML('beforeend', getVideoProjectHtml(post));
	});

	bindVideoButtons();
}

function getVideoProjectHtml(post) {
	const videoItems = getVideoItems(post);

	return `
		<article class="video-project-row">
			<div class="video-project-info">
				<p class="video-project-kicker">Project Films</p>
				<h2 class="video-project-title">${escapeHtml(post.title || '')}</h2>
				${post.caption ? `<p class="video-project-caption">${escapeHtml(post.caption)}</p>` : ''}
			</div>

			<div class="video-strip">
				${videoItems.map(function(item, index) {
					const youtubeId = item.youtube_id || extractYoutubeId(item.video_url);
					const title = item.caption || post.title || 'YouTube video';

					return `
						<button type="button" class="video-thumb-button" data-youtube-id="${escapeAttr(youtubeId)}" data-video-title="${escapeAttr(title)}">
							<span class="video-thumb-image">
								<img src="https://img.youtube.com/vi/${escapeAttr(youtubeId)}/hqdefault.jpg" alt="${escapeAttr(title)}">
								<span class="play-button">▶</span>
							</span>
							<span class="video-thumb-title">${escapeHtml(title || `Film ${index + 1}`)}</span>
						</button>
					`;
				}).join('')}
			</div>
		</article>
	`;
}

function getVideoItems(post) {
	return (post.post_items || []).filter(function(item) {
		return item.item_type === 'video' && (item.youtube_id || extractYoutubeId(item.video_url));
	});
}

function bindVideoButtons() {
	document.querySelectorAll('.video-thumb-button').forEach(function(button) {
		button.addEventListener('click', function() {
			openVideoModal(this.dataset.youtubeId, this.dataset.videoTitle);
		});
	});
}

function initVideoModal() {
	if (document.getElementById('videoModal')) {
		return;
	}

	document.body.insertAdjacentHTML('beforeend', `
		<div class="video-modal" id="videoModal" aria-hidden="true">
			<div class="video-modal-bg" data-video-modal-close></div>

			<div class="video-modal-panel" role="dialog" aria-modal="true" aria-label="영상 재생">
				<button type="button" class="video-modal-close" data-video-modal-close aria-label="영상 닫기">×</button>
				<div class="video-modal-frame" id="videoModalFrame"></div>
			</div>
		</div>
	`);

	document.querySelectorAll('[data-video-modal-close]').forEach(function(button) {
		button.addEventListener('click', closeVideoModal);
	});
}

function openVideoModal(youtubeId, title) {
	const modal = document.getElementById('videoModal');
	const frame = document.getElementById('videoModalFrame');

	if (!modal || !frame || !youtubeId) {
		return;
	}

	frame.innerHTML = `
		<iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}?autoplay=1&rel=0" title="${escapeAttr(title || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
	`;

	modal.classList.add('open');
	modal.setAttribute('aria-hidden', 'false');
	document.body.classList.add('modal-open');
}

function closeVideoModal() {
	const modal = document.getElementById('videoModal');
	const frame = document.getElementById('videoModalFrame');

	if (!modal || !frame) {
		return;
	}

	modal.classList.remove('open');
	modal.setAttribute('aria-hidden', 'true');
	frame.innerHTML = '';
	document.body.classList.remove('modal-open');
}

function groupPostsByCategory(posts) {
	return posts.reduce(function(result, post) {
		const categoryCode = post.category_code || 'performance';

		if (!result[categoryCode]) {
			result[categoryCode] = [];
		}

		result[categoryCode].push(post);
		return result;
	}, {});
}

function getImageCategories() {
	return [
		{ code: 'performance', name: 'Performance' },
		{ code: 'exhibition', name: 'Exhibition' },
		{ code: 'festival-event', name: 'Festival / Event' },
		{ code: 'interview', name: 'Interview' }
	];
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
