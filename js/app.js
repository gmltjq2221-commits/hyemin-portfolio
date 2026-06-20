const VIEWS = {
	home: { file: 'pages/home.html', title: 'HHM Film Portfolio' },
	photography: { file: 'pages/photography.html', title: 'Photography - HHM Film' },
	videography: { file: 'pages/videography.html', title: 'Videography - HHM Film' },
	about: { file: 'pages/about.html', title: 'About - HHM Film' },
	detail: { file: 'pages/detail.html', title: 'Detail - HHM Film' }
};

const viewTemplateCache = new Map();
const boardRequestCache = new Map();
const postRequestCache = new Map();
const postMemoryCache = new Map();
let profileRequestCache = null;
const DEPARTURE_DURATION = 1250;
const ASSET_VERSION = '20260620-v10';

let activeView = '';
let sliderTimers = [];
let navigationVersion = 0;

window.addEventListener('DOMContentLoaded', function() {
	document.getElementById('year').textContent = new Date().getFullYear();
	bindCommonEvents();
	renderRoute();

	window.setTimeout(function() {
		Object.keys(VIEWS).filter(function(view) { return view !== getRoute().view; }).forEach(prefetchView);
	}, 900);
});

function bindCommonEvents() {
	document.getElementById('siteMenu').addEventListener('click', function(event) {
		if (event.target.closest('[data-view-link]')) {
			closeMobileMenu();
		}
	});

	document.getElementById('mobileMenuBtn').addEventListener('click', toggleMobileMenu);
	window.addEventListener('hashchange', renderRoute);

	document.addEventListener('pointerover', function(event) {
		const link = event.target.closest('[data-view-link]');
		if (link && VIEWS[link.dataset.viewLink]) {
			prefetchView(link.dataset.viewLink);
		}

		const detailLink = event.target.closest('a[data-transition-detail]');
		if (detailLink && detailLink.dataset.postId) {
			prefetchDetail(detailLink.dataset.postId);
		}
	});

	document.addEventListener('click', function(event) {
		if (!event.target.closest('header')) {
			closeMobileMenu();
		}

		const sliderButton = event.target.closest('[data-slider][data-direction]');
		if (sliderButton) {
			moveSlider(sliderButton.dataset.slider, Number(sliderButton.dataset.direction));
			return;
		}

		const detailLink = event.target.closest('a[data-transition-detail]');
		if (detailLink && canHandleNavigation(event)) {
			event.preventDefault();
			transitionToDetail(detailLink.href, detailLink.dataset.postId);
		}
	});

	document.addEventListener('keydown', function(event) {
		if (event.key === 'Escape') {
			closeMobileMenu();
			closeVideoModal();
		}
	});
}

function getRoute() {
	const rawHash = decodeURIComponent(window.location.hash.replace(/^#/, '')) || 'home';
	const [viewName, ...params] = rawHash.split('&');
	const values = {};

	params.forEach(function(part) {
		const [key, value] = part.split('=');
		if (key) {
			values[key] = value || '';
		}
	});

	return {
		view: VIEWS[viewName] ? viewName : 'home',
		params: values
	};
}

function getEmbeddedViewTemplate(view) {
	const template = document.getElementById(`view-template-${view}`);
	return template ? template.innerHTML.trim() : '';
}

function fetchViewTemplate(view) {
	if (!VIEWS[view]) {
		return Promise.reject(new Error(`알 수 없는 화면입니다. (${view})`));
	}

	if (viewTemplateCache.has(view)) {
		return viewTemplateCache.get(view);
	}

	const embeddedTemplate = getEmbeddedViewTemplate(view);
	const localFileMode = window.location.protocol === 'file:';
	const templateUrlObject = new URL(VIEWS[view].file, window.location.href);
	templateUrlObject.searchParams.set('v', ASSET_VERSION);
	const templateUrl = templateUrlObject.href;

	const request = localFileMode
		? Promise.resolve(embeddedTemplate)
		: fetch(templateUrl, { cache: 'no-store' })
			.then(function(response) {
				if (!response.ok) {
					throw new Error(`화면 조각 요청 실패 (${response.status})`);
				}

				return response.text();
			})
			.then(function(template) {
				if (!template || !template.trim()) {
					throw new Error('화면 조각의 내용이 비어 있습니다.');
				}

				return template;
			})
			.catch(function(error) {
				if (embeddedTemplate) {
					console.warn(`외부 화면 조각을 불러오지 못해 내장 템플릿을 사용합니다: ${VIEWS[view].file}`, error);
					return embeddedTemplate;
				}

				throw error;
			});

	const safeRequest = request.catch(function(error) {
		// 실패한 Promise는 캐시에 남기지 않아, 다음 이동에서 다시 요청할 수 있게 합니다.
		viewTemplateCache.delete(view);
		throw error;
	});

	viewTemplateCache.set(view, safeRequest);
	return safeRequest;
}
function prefetchView(view) {
	if (!VIEWS[view]) {
		return Promise.resolve();
	}

	return Promise.allSettled([fetchViewTemplate(view), warmViewData(view)]);
}

function warmViewData(view) {
	if (view === 'home') {
		return Promise.all([
			warmBoardPosts('IMAGE_ARCHIVE', true),
			warmBoardPosts('VIDEO_ARCHIVE', true)
		]);
	}

	if (view === 'photography') {
		return warmBoardPosts('IMAGE_ARCHIVE', false);
	}

	if (view === 'videography') {
		return warmBoardPosts('VIDEO_ARCHIVE', false);
	}

	if (view === 'about') {
		return warmProfile();
	}

	if (view === 'detail') {
		return Promise.resolve();
	}

	return Promise.resolve();
}

async function warmBoardPosts(boardCode, featuredOnly) {
	const board = await getBoardByCode(boardCode);
	return board ? getPostsByBoardId(board.id, featuredOnly) : [];
}

function getSiteProfile() {
	if (!profileRequestCache) {
		profileRequestCache = db
			.from('site_profiles')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle()
			.then(function(result) {
				if (result.error) {
					console.error('작가 정보 조회 오류:', result.error);
					return null;
				}
				return result.data;
			});
	}

	return profileRequestCache;
}

function warmProfile() {
	return getSiteProfile();
}

async function renderRoute() {
	const route = getRoute();
	const currentNavigation = ++navigationVersion;

	if (route.view === activeView) {
		updateMenu(route.view);
		if (route.view === 'videography') {
			moveToSelectedVideo(route.params);
		}
		return;
	}

	clearSliderTimers();
	const app = document.getElementById('app');
	const previousView = app.firstElementChild;
	const nextTemplate = fetchViewTemplate(route.view);
	const nextData = warmViewData(route.view);

	app.classList.add('is-switching');

	if (previousView) {
		previousView.classList.add('is-leaving');
	}

	try {
		const results = await Promise.all([
			nextTemplate,
			previousView ? wait(DEPARTURE_DURATION) : Promise.resolve()
		]);

		if (currentNavigation !== navigationVersion) {
			return;
		}

		window.scrollTo({ top: 0, behavior: 'auto' });
		app.innerHTML = `<div class="view view-${route.view} is-preparing">${results[0]}</div>`;
		activeView = route.view;
		document.body.classList.toggle('is-video-page', route.view === 'videography');
		document.title = VIEWS[route.view].title;
		updateMenu(route.view);

		await nextData;
		if (currentNavigation !== navigationVersion) {
			return;
		}

		await initializeView(route.view, route.params);
		prepareImageReveals(app);

		requestAnimationFrame(function() {
			requestAnimationFrame(function() {
				const nextView = app.firstElementChild;
				if (!nextView || currentNavigation !== navigationVersion) {
					return;
				}

				nextView.classList.remove('is-preparing');
				nextView.classList.add('is-active');
				app.classList.remove('is-switching');
			});
		});
	} catch (error) {
		if (currentNavigation !== navigationVersion) {
			return;
		}

		console.error('화면 전환 오류:', error);
		app.innerHTML = '<section class="section"><p class="empty-message">화면을 표시하는 중 문제가 발생했습니다.</p></section>';
		app.classList.remove('is-switching');
	}
}

async function initializeView(view, params) {
	if (view === 'home') {
		await loadHomeData();
		return;
	}

	if (view === 'about') {
		await loadSiteProfile();
		return;
	}

	if (view === 'photography') {
		await loadArchiveData('IMAGE_ARCHIVE', 'photo');
		return;
	}

	if (view === 'videography') {
		initVideoModal();
		await loadArchiveData('VIDEO_ARCHIVE', 'video');
		moveToSelectedVideo(params);
		return;
	}

	if (view === 'detail') {
		await loadDetailView(params.id || '');
	}
}

function canHandleNavigation(event) {
	return !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;
}

function transitionToDetail(url, postId) {
	const id = String(postId || '');
	if (!id) {
		return;
	}

	// 상세 템플릿, 게시글 정보, 원본 이미지를 퇴장 모션과 동시에 준비합니다.
	prefetchDetail(id);
	window.location.hash = `detail&id=${encodeURIComponent(id)}`;
}

function prefetchDetail(postId) {
	const post = postMemoryCache.get(String(postId));
	const detailData = post ? Promise.resolve(post) : getPostDetail(postId);

	return Promise.allSettled([fetchViewTemplate('detail'), detailData.then(function(data) {
		if (data) { preloadPostImages(data); }
		return data;
	})]);
}

async function getPostDetail(postId) {
	const cacheKey = String(postId);
	if (postMemoryCache.has(cacheKey)) {
		return postMemoryCache.get(cacheKey);
	}

	const { data, error } = await db
		.from('posts')
		.select(`
			id, board_id, title, caption, description, thumbnail_url, sort_order, is_visible, category_code, created_at,
			boards ( id, board_code, board_name, board_type ),
			post_items ( id, post_id, item_type, image_url, video_url, youtube_id, caption, description, sort_order, is_visible )
		`)
		.eq('id', postId)
		.eq('is_visible', true)
		.maybeSingle();

	if (error) {
		console.error('상세 데이터 조회 오류:', error);
		return null;
	}

	if (!data) {
		return null;
	}

	data.post_items = (data.post_items || [])
		.filter(function(item) { return item.is_visible === true; })
		.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
	rememberPost(data);
	return data;
}

async function loadDetailView(postId) {
	if (!postId) {
		window.location.hash = 'photography';
		return;
	}

	const post = await getPostDetail(postId);
	if (!post) {
		const title = document.getElementById('detailTitle');
		if (title) { title.textContent = '작업을 찾을 수 없습니다.'; }
		return;
	}

	document.title = `${post.title || 'Detail'} - HHM Film`;
	setText('detailTitle', post.title);
	setText('detailCaption', post.caption);
	setText('detailDescription', post.description);
	setText('detailCategory', getCategoryName(post.category_code));
	renderDetailItems(post);
	setDetailBackLink(post);
}

function renderDetailItems(post) {
	const target = document.getElementById('itemList');
	if (!target) { return; }
	target.innerHTML = '';

	(post.post_items || []).forEach(function(item) {
		if (item.item_type === 'video') {
			const youtubeId = item.youtube_id || extractYoutubeId(item.video_url);
			if (!youtubeId) { return; }
			target.insertAdjacentHTML('beforeend', `<article class="item-box"><div class="video-wrap"><iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(item.caption || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>${getDetailItemInfo(item)}</article>`);
			return;
		}

		if (!item.image_url) { return; }
		target.insertAdjacentHTML('beforeend', `<article class="item-box"><div class="item-image-wrap"><img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || '')}" class="item-image"></div>${getDetailItemInfo(item)}</article>`);
	});
}

function getDetailItemInfo(item) {
	if (!item.caption && !item.description) { return ''; }
	return `<div class="item-info">${item.caption ? `<h2 class="item-caption">${escapeHtml(item.caption)}</h2>` : ''}${item.description ? `<p class="item-description">${escapeHtml(item.description)}</p>` : ''}</div>`;
}

function setDetailBackLink(post) {
	const link = document.getElementById('backLink');
	if (!link) { return; }
	const boardCode = post.boards ? post.boards.board_code : '';
	if (boardCode === 'IMAGE_ARCHIVE') {
		link.href = '#photography';
		link.textContent = '← Image';
		return;
	}
	if (boardCode === 'VIDEO_ARCHIVE') {
		link.href = '#videography';
		link.textContent = '← Video';
		return;
	}
	link.href = '#home';
	link.textContent = '← Home';
}


function preloadPostImages(post) {
	(post.post_items || []).forEach(function(item) {
		if (!item.image_url) {
			return;
		}

		const image = new Image();
		image.decoding = 'async';
		image.src = item.image_url;
	});
}

function rememberPost(post) {
	if (post && post.id !== undefined && post.id !== null) {
		postMemoryCache.set(String(post.id), post);
	}
}

function updateMenu(view) {
	document.querySelectorAll('[data-view-link]').forEach(function(link) {
		link.classList.toggle('active', link.dataset.viewLink === view);
	});
}

function toggleMobileMenu(event) {
	event.stopPropagation();

	const menu = document.getElementById('siteMenu');
	const button = document.getElementById('mobileMenuBtn');
	const isOpen = menu.classList.toggle('open');

	button.classList.toggle('open', isOpen);
	button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	button.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
}

function closeMobileMenu() {
	const menu = document.getElementById('siteMenu');
	const button = document.getElementById('mobileMenuBtn');

	menu.classList.remove('open');
	button.classList.remove('open');
	button.setAttribute('aria-expanded', 'false');
	button.setAttribute('aria-label', '메뉴 열기');
}

async function loadHomeData() {
	await Promise.all([
		loadFeaturedPosts('IMAGE_ARCHIVE', 'photoSlider', false),
		loadFeaturedPosts('VIDEO_ARCHIVE', 'videoSlider', true)
	]);

	startAutoSliders();
}

async function loadSiteProfile() {
	const data = await getSiteProfile();

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

	if (!aboutInfo.children.length) {
		aboutInfo.style.display = 'none';
	}
}

function appendInfoRow(target, label, value, link) {
	if (!value) {
		return;
	}

	target.insertAdjacentHTML('beforeend', `
		<div class="info-row">
			<strong>${escapeHtml(label)}</strong>
			<span>${link ? `<a href="${escapeAttr(link)}" target="${link.startsWith('mailto:') ? '_self' : '_blank'}" rel="noopener noreferrer">${escapeHtml(value)}</a>` : escapeHtml(value)}</span>
		</div>
	`);
}

async function loadFeaturedPosts(boardCode, sliderId, isVideo) {
	const slider = document.getElementById(sliderId);

	if (!slider) {
		return;
	}

	const board = await getBoardByCode(boardCode);
	const posts = board ? await getPostsByBoardId(board.id, true) : [];

	slider.innerHTML = '';

	posts.forEach(function(post) {
		const html = isVideo ? getFeaturedVideoHtml(post) : getFeaturedImageHtml(post);

		if (html) {
			slider.insertAdjacentHTML('beforeend', html);
		}
	});

	slider.classList.toggle('is-empty', !slider.querySelector('.slide-card'));
}

function getFeaturedImageHtml(post) {
	const item = getRepresentativeImageItem(post, getImageItems(post));

	if (!item) {
		return '';
	}

	return `
		<a class="slide-card" data-transition-detail data-post-id="${escapeAttr(post.id)}" href="#detail&id=${encodeURIComponent(post.id)}">
			<div class="slide-image">
				<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || post.title || '')}">
				<div class="slide-info"><span>${escapeHtml(post.title || '')}</span></div>
			</div>
		</a>
	`;
}

function getFeaturedVideoHtml(post) {
	const item = getVideoItems(post)[0];
	const youtubeId = item ? (item.youtube_id || extractYoutubeId(item.video_url)) : '';

	if (!youtubeId) {
		return '';
	}

	return `
		<a class="slide-card" href="#videography&post=${encodeURIComponent(post.id)}&video=${encodeURIComponent(youtubeId)}">
			<div class="slide-image">
				<img src="https://img.youtube.com/vi/${escapeAttr(youtubeId)}/hqdefault.jpg" alt="${escapeAttr(post.title || 'YouTube video')}">
				<span class="play-button">▶</span>
				<div class="slide-info"><span>${escapeHtml(post.title || '')}</span></div>
			</div>
		</a>
	`;
}

async function loadArchiveData(boardCode, pageKind) {
	const archiveList = document.getElementById('archiveList');

	if (!archiveList) {
		return;
	}

	const board = await getBoardByCode(boardCode);
	const posts = board ? await getPostsByBoardId(board.id, false) : [];

	if (pageKind === 'video') {
		renderVideoList(archiveList, posts);
	} else {
		renderImageList(archiveList, posts);
	}
}

function getBoardByCode(boardCode) {
	if (!boardRequestCache.has(boardCode)) {
		boardRequestCache.set(boardCode, db
			.from('boards')
			.select('id, board_code, board_name, board_type')
			.eq('board_code', boardCode)
			.eq('is_visible', true)
			.maybeSingle()
			.then(function(result) {
				if (result.error) {
					console.error('게시판 조회 오류:', result.error);
					return null;
				}
				return result.data;
			}));
	}

	return boardRequestCache.get(boardCode);
}

function getPostsByBoardId(boardId, featuredOnly) {
	const cacheKey = `${boardId}:${featuredOnly ? 'featured' : 'all'}`;

	if (!postRequestCache.has(cacheKey)) {
		let query = db
			.from('posts')
			.select(`
				id, board_id, title, caption, description, thumbnail_url, sort_order, is_visible,
				is_featured, category_code, created_at,
				post_items ( id, item_type, image_url, video_url, youtube_id, caption, description, sort_order, is_visible )
			`)
			.eq('board_id', boardId)
			.eq('is_visible', true)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: false });

		if (featuredOnly) {
			query = query.eq('is_featured', true);
		}

		postRequestCache.set(cacheKey, query.then(function(result) {
			if (result.error) {
				console.error('게시글 목록 조회 오류:', result.error);
				return [];
			}

			return (result.data || []).map(function(post) {
				post.post_items = (post.post_items || [])
					.filter(function(item) { return item.is_visible === true; })
					.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
				rememberPost(post);
				return post;
			});
		}));
	}

	return postRequestCache.get(cacheKey);
}

function renderImageList(target, posts) {
	const groups = groupPostsByCategory(posts);
	let count = 0;

	target.innerHTML = getImageCategories().map(function(category) {
		const categoryPosts = groups[category.code] || [];

		if (!categoryPosts.length) {
			return '';
		}

		count += categoryPosts.length;

		return `
			<section class="photo-category" id="${escapeAttr(category.code)}">
				<div class="category-head"><h2 class="category-title">${escapeHtml(category.name)}</h2></div>
				<div class="photo-project-list">${categoryPosts.map(getImageProjectHtml).join('')}</div>
			</section>
		`;
	}).join('');

	if (!count) {
		target.innerHTML = '<p class="empty-message">등록된 이미지가 없습니다.</p>';
	}
}

function getImageProjectHtml(post) {
	const item = getRepresentativeImageItem(post, getImageItems(post));

	if (!item) {
		return '';
	}

	return `
		<article class="photo-card">
			<a href="#detail&id=${encodeURIComponent(post.id)}" class="photo-card-link" data-transition-detail data-post-id="${escapeAttr(post.id)}">
				<div class="photo-card-image"><img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || post.title || '')}"></div>
				<div class="photo-card-info">
					<h2 class="photo-card-title">${escapeHtml(post.title || '')}</h2>
					${post.caption ? `<p class="photo-card-caption">${escapeHtml(post.caption)}</p>` : ''}
				</div>
			</a>
		</article>
	`;
}

function renderVideoList(target, posts) {
	const videoPosts = posts.filter(function(post) {
		return getVideoItems(post).length > 0;
	});

	if (!videoPosts.length) {
		target.innerHTML = '<p class="empty-message">등록된 영상이 없습니다.</p>';
		return;
	}

	target.innerHTML = videoPosts.map(getVideoProjectHtml).join('');
	target.querySelectorAll('.video-thumb-button').forEach(function(button) {
		button.addEventListener('click', function() {
			openVideoModal(this.dataset.youtubeId, this.dataset.videoTitle);
		});
	});
}

function getVideoProjectHtml(post) {
	const videoItems = getVideoItems(post);

	return `
		<article class="video-project-row" id="video-post-${escapeAttr(post.id)}">
			<div class="video-project-info">
				<p class="video-project-kicker">Project Films</p>
				<h2 class="video-project-title">${escapeHtml(post.title || '')}</h2>
				${post.caption ? `<p class="video-project-caption">${escapeHtml(post.caption)}</p>` : ''}
			</div>
			<div class="video-strip">
				${videoItems.map(function(item, index) {
					const youtubeId = item.youtube_id || extractYoutubeId(item.video_url);
					const title = item.caption || post.title || `Film ${index + 1}`;

					return `
						<button type="button" id="video-item-${escapeAttr(youtubeId)}" class="video-thumb-button" data-youtube-id="${escapeAttr(youtubeId)}" data-video-title="${escapeAttr(title)}">
							<span class="video-thumb-image">
								<img src="https://img.youtube.com/vi/${escapeAttr(youtubeId)}/hqdefault.jpg" alt="${escapeAttr(title)}">
								<span class="play-button">▶</span>
							</span>
							<span class="video-thumb-title">${escapeHtml(title)}</span>
						</button>
					`;
				}).join('')}
			</div>
		</article>
	`;
}

function getImageItems(post) {
	return (post.post_items || []).filter(function(item) {
		return item.item_type !== 'video' && item.image_url;
	});
}

function getVideoItems(post) {
	return (post.post_items || []).filter(function(item) {
		return item.item_type === 'video' && (item.youtube_id || extractYoutubeId(item.video_url));
	});
}

function getRepresentativeImageItem(post, imageItems) {
	if (post.thumbnail_url) {
		return { image_url: post.thumbnail_url, caption: post.title || '' };
	}

	return imageItems[0] || null;
}

function groupPostsByCategory(posts) {
	return posts.reduce(function(groups, post) {
		const category = post.category_code || 'performance';
		(groups[category] ||= []).push(post);
		return groups;
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

function getCategoryName(categoryCode) {
	const category = getImageCategories().find(function(item) {
		return item.code === categoryCode;
	});

	return category ? category.name : '';
}

function setText(elementId, value) {
	const element = document.getElementById(elementId);

	if (!element) {
		return;
	}

	const text = value || '';
	element.textContent = text;
	element.style.display = text ? '' : 'none';
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

	if (!youtubeId || !modal || !frame) {
		return;
	}

	frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}?autoplay=1&rel=0" title="${escapeAttr(title || 'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
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

function moveToSelectedVideo(params) {
	if (!params || (!params.post && !params.video)) {
		return;
	}

	setTimeout(function() {
		const target = params.video
			? document.getElementById(`video-item-${params.video}`)
			: document.getElementById(`video-post-${params.post}`);

		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}, 150);
}

function moveSlider(id, direction) {
	const slider = document.getElementById(id);
	const card = slider ? slider.querySelector('.slide-card') : null;

	if (!card) {
		return;
	}

	slider.scrollBy({ left: (card.offsetWidth + 20) * direction, behavior: 'smooth' });
}

function startAutoSliders() {
	document.querySelectorAll('[data-auto-slider]').forEach(function(slider) {
		let paused = false;

		['mouseenter', 'touchstart'].forEach(function(type) {
			slider.addEventListener(type, function() { paused = true; }, { passive: true });
		});

		['mouseleave', 'touchend', 'touchcancel'].forEach(function(type) {
			slider.addEventListener(type, function() { paused = false; }, { passive: true });
		});

		sliderTimers.push(window.setInterval(function() {
			const card = slider.querySelector('.slide-card');

			if (!card || paused || activeView !== 'home') {
				return;
			}

			const step = card.offsetWidth + 20;
			const max = slider.scrollWidth - slider.clientWidth - 5;

			if (slider.scrollLeft >= max) {
				slider.scrollTo({ left: 0, behavior: 'smooth' });
			} else {
				slider.scrollBy({ left: step, behavior: 'smooth' });
			}
		}, 7600));
	});
}

function clearSliderTimers() {
	sliderTimers.forEach(function(timer) { clearInterval(timer); });
	sliderTimers = [];
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

function prepareImageReveals(target) {
	const images = Array.from(target.querySelectorAll('img'));

	images.forEach(function(image, index) {
		const wrapper = image.closest('.slide-image, .photo-card-image, .video-thumb-image');
		const reveal = function() {
			window.setTimeout(function() {
				image.classList.add('is-loaded');
				if (wrapper) {
					wrapper.classList.add('is-loaded');
				}
			}, Math.min(index * 55, 440));
		};

		if (image.complete) {
			reveal();
		} else {
			image.addEventListener('load', reveal, { once: true });
			image.addEventListener('error', reveal, { once: true });
		}
	});
}

function wait(ms) {
	return new Promise(function(resolve) { window.setTimeout(resolve, ms); });
}
