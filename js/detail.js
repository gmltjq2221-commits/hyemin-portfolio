document.addEventListener('DOMContentLoaded', function() {
	initCommonUi();
	loadDetailData();
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

async function loadDetailData() {
	const loading = document.getElementById('loading');
	const itemList = document.getElementById('itemList');
	const postId = getPostId();

	if (!postId) {
		renderEmpty(itemList, '잘못된 접근입니다.');
		hideLoading(loading);
		return;
	}

	try {
		const post = await getPostDetail(postId);

		if (!post) {
			renderEmpty(itemList, '게시글을 찾을 수 없습니다.');
			return;
		}

		renderPostDetail(post);
		renderPostItems(post);
		setBackLink(post);
	} catch (error) {
		console.error('상세 데이터 로딩 오류:', error);
		renderEmpty(itemList, '데이터를 불러오는 중 오류가 발생했습니다.');
	} finally {
		hideLoading(loading);
	}
}

function getPostId() {
	const params = new URLSearchParams(window.location.search);
	const id = params.get('id');

	if (!id) {
		return '';
	}

	return id;
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
	const detailTitle = document.getElementById('detailTitle');
	const detailCaption = document.getElementById('detailCaption');
	const detailDescription = document.getElementById('detailDescription');
	const detailCategory = document.getElementById('detailCategory');
	const footerText = document.getElementById('footerText');
	const categoryName = getCategoryName(post.category_code);

	document.title = `${post.title || 'Detail'} - HHM Film`;

	if (detailTitle) {
		detailTitle.textContent = post.title || '';
	}

	if (detailCaption) {
		detailCaption.textContent = post.caption || '';
	}

	if (detailDescription) {
		detailDescription.textContent = post.description || '';
	}

	if (detailCategory && categoryName) {
		detailCategory.textContent = categoryName;
		detailCategory.style.display = 'inline-flex';
	}

	if (footerText) {
		footerText.textContent = post.title || 'Detail';
	}
}

function renderPostItems(post) {
	const itemList = document.getElementById('itemList');

	if (!itemList) {
		return;
	}

	itemList.innerHTML = '';

	if (!post.post_items || post.post_items.length === 0) {
		renderEmpty(itemList, '등록된 이미지 또는 영상이 없습니다.');
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
			<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || '')}" class="item-image" />
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
				<iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(item.caption || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
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
		backLink.href = 'images.html';
		backLink.textContent = '← Image';
		return;
	}

	if (post.boards.board_code === 'VIDEO_ARCHIVE') {
		backLink.href = 'videos.html';
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

function renderEmpty(target, message) {
	if (!target) {
		return;
	}

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
