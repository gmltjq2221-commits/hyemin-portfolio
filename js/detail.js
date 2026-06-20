document.addEventListener('DOMContentLoaded', function() {
	initCommonUi();
	loadDetailData();
});

function initCommonUi() {
	const year = document.getElementById('year');

	if (year) {
		year.textContent = new Date().getFullYear();
	}

	document.addEventListener('click', function(event) {
		if (!event.target.closest('header')) {
			closeMobileMenu();
		}
	});

	document.querySelectorAll('#siteMenu a').forEach(function(link) {
		link.addEventListener('click', function() {
			closeMobileMenu();
		});
	});

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

async function loadDetailData() {
	const loading = document.getElementById('loading');
	const postId = getPostId();

	if (!postId) {
		hideLoading(loading);
		return;
	}

	try {
		const post = getCachedPost(postId) || await getPostDetail(postId);

		if (!post) {
			return;
		}

		renderPostDetail(post);
		renderPostItems(post);
		setBackLink(post);
	} catch (error) {
		console.error('상세 데이터 로딩 오류:', error);
	} finally {
		hideLoading(loading);
	}
}

function getPostId() {
	const params = new URLSearchParams(window.location.search);
	return params.get('id') || '';
}

function getCachedPost(postId) {
	try {
		const rawPost = sessionStorage.getItem(`hhm-detail-${postId}`);
		if (!rawPost) {
			return null;
		}

		sessionStorage.removeItem(`hhm-detail-${postId}`);
		const post = JSON.parse(rawPost);
		post.post_items = (post.post_items || [])
			.filter(function(item) { return item.is_visible === true; })
			.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
		return post;
	} catch (error) {
		console.warn('상세 데이터 임시 불러오기 오류:', error);
		return null;
	}
}

async function getPostDetail(postId) {
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
			boards (
				id,
				board_code,
				board_name,
				board_type
			),
			post_items (
				id,
				post_id,
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
		.eq('id', postId)
		.eq('is_visible', true)
		.maybeSingle();

	if (error) {
		console.error('게시글 상세 조회 오류:', error);
		return null;
	}

	if (!data) {
		return null;
	}

	data.post_items = (data.post_items || [])
		.filter(function(item) {
			return item.is_visible === true;
		})
		.sort(function(a, b) {
			return (a.sort_order || 0) - (b.sort_order || 0);
		});

	return data;
}

function renderPostDetail(post) {
	const categoryName = getCategoryName(post.category_code);

	document.title = `${post.title || 'Detail'} - HHM Film`;
	setText('detailTitle', post.title);
	setText('detailCaption', post.caption);
	setText('detailDescription', post.description);
	setText('detailCategory', categoryName);
}

function renderPostItems(post) {
	const itemList = document.getElementById('itemList');

	if (!itemList) {
		return;
	}

	itemList.innerHTML = '';

	if (!post.post_items || post.post_items.length === 0) {
		return;
	}

	post.post_items.forEach(function(item) {
		if (item.item_type === 'video') {
			renderVideoItem(itemList, item);
			return;
		}

		renderImageItem(itemList, item);
	});
}

function renderImageItem(target, item) {
	if (!item.image_url) {
		return;
	}

	target.insertAdjacentHTML('beforeend', `
		<article class="item-box">
			<div class="item-image-wrap">
				<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || '')}" class="item-image">
			</div>
			${getItemInfoHtml(item)}
		</article>
	`);
}

function renderVideoItem(target, item) {
	const youtubeId = item.youtube_id || extractYoutubeId(item.video_url);

	if (!youtubeId) {
		return;
	}

	target.insertAdjacentHTML('beforeend', `
		<article class="item-box">
			<div class="video-wrap">
				<iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(item.caption || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
			</div>
			${getItemInfoHtml(item)}
		</article>
	`);
}

function getItemInfoHtml(item) {
	if (!item.caption && !item.description) {
		return '';
	}

	return `
		<div class="item-info">
			${item.caption ? `<h2 class="item-caption">${escapeHtml(item.caption)}</h2>` : ''}
			${item.description ? `<p class="item-description">${escapeHtml(item.description)}</p>` : ''}
		</div>
	`;
}

function setBackLink(post) {
	const backLink = document.getElementById('backLink');

	if (!backLink || !post.boards) {
		return;
	}

	if (post.boards.board_code === 'IMAGE_ARCHIVE') {
		backLink.href = 'index.html#photography';
		backLink.textContent = '← Image';
		return;
	}

	if (post.boards.board_code === 'VIDEO_ARCHIVE') {
		backLink.href = 'index.html#videography';
		backLink.textContent = '← Video';
		return;
	}

	backLink.href = 'index.html';
	backLink.textContent = '← Home';
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

function setText(id, value) {
	const element = document.getElementById(id);

	if (element) {
		element.textContent = value || '';
	}
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
