// =========================================================
// HHM Film 메인 페이지 DB 연동
// =========================================================

document.addEventListener('DOMContentLoaded', function () {
	loadMainData();
});

// =========================================================
// 전체 데이터 로딩
// =========================================================
async function loadMainData() {
	await loadProfile();
	await loadFeaturedImages();
	await loadFeaturedVideos();
	await loadImageArchive();
	await loadVideoArchive();

	resetImageClickEvents();
}

// =========================================================
// 작가 정보 조회
// =========================================================
async function loadProfile() {
	const { data, error } = await db
		.from('site_profiles')
		.select('*')
		.order('id', { ascending: true })
		.limit(1)
		.single();

	if (error) {
		console.error('작가 정보 조회 실패:', error);
		return;
	}

	const aboutTitle = document.querySelector('#about .section-title');
	const aboutText = document.querySelector('#about .about-text');
	const aboutInfo = document.querySelector('#about .about-info');

	if (aboutTitle && data.artist_name) {
		aboutTitle.innerHTML = escapeHtml(data.artist_name).replaceAll(' ', '<br>');
	}

	if (aboutText) {
		aboutText.innerHTML = `
			<h3>작가의 말</h3>
			<p>${nl2br(escapeHtml(data.artist_message || ''))}</p>
		`;
	}

	if (aboutInfo) {
		const instagramText = getInstagramText(data.instagram_url);

		aboutInfo.innerHTML = `
			<div class="info-row">
				<strong>Name</strong>
				<span>${escapeHtml(data.artist_name || '')}</span>
			</div>
			<div class="info-row">
				<strong>Email</strong>
				<span>${data.email ? `<a href="mailto:${escapeAttr(data.email)}">${escapeHtml(data.email)}</a>` : ''}</span>
			</div>
			<div class="info-row">
				<strong>Instagram</strong>
				<span>${data.instagram_url ? `<a href="${escapeAttr(data.instagram_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(instagramText)}</a>` : ''}</span>
			</div>
			<div class="info-row">
				<strong>Category</strong>
				<span>Photo / Video</span>
			</div>
		`;
	}
}

// =========================================================
// 대표 이미지 게시판 조회
// =========================================================
async function loadFeaturedImages() {
	const posts = await getPostsByBoardCode('FEATURED_IMAGE');
	const slider = document.querySelector('#photoSlider');

	if (!slider) {
		return;
	}

	slider.innerHTML = '';

	if (!posts || posts.length === 0) {
		slider.innerHTML = getEmptySlide('등록된 대표 이미지가 없습니다.');
		return;
	}

	posts.forEach(function (post) {
		const imageUrl = post.thumbnail_url || getFirstImageUrl(post.post_items);
		const categoryText = getCategoryName(post.category_code);

		if (!imageUrl) {
			return;
		}

		const card = document.createElement('div');
		card.className = 'slide-card';
		card.onclick = function () {
			if (post.category_code === 'exhibition') {
				location.href = '#exhibition';
				return;
			}

			if (post.category_code === 'festival-event') {
				location.href = '#festival';
				return;
			}

			location.href = '#performance';
		};

		card.innerHTML = `
			<div class="slide-image">
				<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(post.title)}">
				<div class="slide-info">
					<span>${escapeHtml(post.caption || categoryText || post.title)}</span>
					<span>Photo</span>
				</div>
			</div>
		`;

		slider.appendChild(card);
	});
}

// =========================================================
// 대표 동영상 게시판 조회
// =========================================================
async function loadFeaturedVideos() {
	const posts = await getPostsByBoardCode('FEATURED_VIDEO');
	const slider = document.querySelector('#videoSlider');

	if (!slider) {
		return;
	}

	slider.innerHTML = '';

	if (!posts || posts.length === 0) {
		slider.innerHTML = getEmptySlide('등록된 대표 동영상이 없습니다.');
		return;
	}

	posts.forEach(function (post) {
		const firstVideo = getFirstVideoItem(post.post_items);
		const youtubeId = firstVideo?.youtube_id || getYoutubeId(firstVideo?.video_url || post.youtube_url || '');

		if (!youtubeId) {
			return;
		}

		const card = document.createElement('div');
		card.className = 'slide-card';

		card.innerHTML = `
			<div class="slide-image">
				<iframe
					class="video-embed"
					src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}"
					title="${escapeAttr(post.title)}"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					referrerpolicy="strict-origin-when-cross-origin"
					allowfullscreen>
				</iframe>
			</div>
		`;

		slider.appendChild(card);
	});
}

// =========================================================
// 이미지 저장 게시판 조회
// =========================================================
async function loadImageArchive() {
	const posts = await getPostsByBoardCode('IMAGE_ARCHIVE');

	const categoryMap = {
		'performance': document.querySelector('#performanceGrid'),
		'exhibition': document.querySelector('#exhibitionGrid'),
		'festival-event': document.querySelector('#festivalGrid')
	};

	Object.values(categoryMap).forEach(function (grid) {
		if (grid) {
			grid.innerHTML = '';
		}
	});

	if (!posts || posts.length === 0) {
		Object.values(categoryMap).forEach(function (grid) {
			if (grid) {
				grid.innerHTML = '<p>등록된 이미지가 없습니다.</p>';
			}
		});
		return;
	}

	posts.forEach(function (post) {
		const categoryCode = post.category_code || 'performance';
		const grid = categoryMap[categoryCode];

		if (!grid) {
			return;
		}

		const items = post.post_items || [];

		items.forEach(function (item, index) {
			if (!item.image_url) {
				return;
			}

			const div = document.createElement('div');
			div.className = 'image-item';

			if (grid.children.length >= 8) {
				div.classList.add('hidden');
			}

			div.dataset.title = item.caption || post.caption || post.title || '';

			div.innerHTML = `
				<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.caption || post.title || '')}">
			`;

			grid.appendChild(div);
		});
	});
}

// =========================================================
// 영상 저장 게시판 조회
// =========================================================
async function loadVideoArchive() {
	const posts = await getPostsByBoardCode('VIDEO_ARCHIVE');
	const wrap = document.querySelector('#videography .section-inner');

	if (!wrap) {
		return;
	}

	const oldProjects = wrap.querySelectorAll('.video-project');
	oldProjects.forEach(function (project) {
		project.remove();
	});

	if (!posts || posts.length === 0) {
		const empty = document.createElement('section');
		empty.className = 'video-project';
		empty.innerHTML = '<p class="video-intro">등록된 영상이 없습니다.</p>';
		wrap.appendChild(empty);
		return;
	}

	posts.forEach(function (post) {
		const section = document.createElement('section');
		section.className = 'video-project';

		const categoryText = getCategoryName(post.category_code);
		const items = post.post_items || [];

		let videoHtml = '';

		items.forEach(function (item) {
			const youtubeId = item.youtube_id || getYoutubeId(item.video_url);

			if (!youtubeId) {
				return;
			}

			videoHtml += `
				<div class="video-card">
					<div class="video-thumb">
						<iframe
							class="video-embed"
							src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}"
							title="${escapeAttr(item.caption || post.title)}"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							referrerpolicy="strict-origin-when-cross-origin"
							allowfullscreen>
						</iframe>
					</div>
					<div class="video-info">
						<h4 class="video-title">${escapeHtml(item.caption || post.title || '')}</h4>
						${item.description ? `<p class="video-desc">${escapeHtml(item.description)}</p>` : ''}
					</div>
				</div>
			`;
		});

		section.innerHTML = `
			<div class="video-project-head">
				<h3 class="video-project-title">${escapeHtml(post.title)}</h3>
				<span class="video-project-category">${escapeHtml(categoryText)}</span>
			</div>
			${post.description ? `<p class="video-intro">${escapeHtml(post.description)}</p>` : ''}
			<div class="video-grid">
				${videoHtml}
			</div>
		`;

		wrap.appendChild(section);
	});
}

// =========================================================
// 게시판 코드로 게시글 조회
// =========================================================
async function getPostsByBoardCode(boardCode) {
	const { data: board, error: boardError } = await db
		.from('boards')
		.select('id')
		.eq('board_code', boardCode)
		.eq('is_visible', true)
		.single();

	if (boardError) {
		console.error(`${boardCode} 게시판 조회 실패:`, boardError);
		return [];
	}

	const { data: posts, error: postsError } = await db
		.from('posts')
		.select(`
			*,
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
		.order('created_at', { ascending: false });

	if (postsError) {
		console.error(`${boardCode} 게시글 조회 실패:`, postsError);
		return [];
	}

	posts.forEach(function (post) {
		post.post_items = (post.post_items || [])
			.filter(function (item) {
				return item.is_visible === true;
			})
			.sort(function (a, b) {
				return (a.sort_order || 0) - (b.sort_order || 0);
			});
	});

	return posts || [];
}

// =========================================================
// 이미지 클릭 이벤트 재설정
// =========================================================
function resetImageClickEvents() {
	document.querySelectorAll('.image-item img').forEach(function (image) {
		image.addEventListener('click', function () {
			openLightbox(image.src);
		});
	});
}

// =========================================================
// 보조 함수
// =========================================================
function getFirstImageUrl(items) {
	if (!items || items.length === 0) {
		return '';
	}

	const item = items.find(function (row) {
		return row.image_url;
	});

	return item ? item.image_url : '';
}

function getFirstVideoItem(items) {
	if (!items || items.length === 0) {
		return null;
	}

	return items.find(function (row) {
		return row.video_url || row.youtube_id;
	}) || null;
}

function getYoutubeId(url) {
	if (!url) {
		return '';
	}

	const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
	const match = url.match(regExp);

	if (match && match[2].length === 11) {
		return match[2];
	}

	return '';
}

function getCategoryName(categoryCode) {
	const map = {
		'performance': 'Performance',
		'exhibition': 'Exhibition',
		'festival-event': 'Festival / Event',
		'interview': 'Interview'
	};

	return map[categoryCode] || '';
}

function getInstagramText(url) {
	if (!url) {
		return '';
	}

	try {
		const parsed = new URL(url);
		const path = parsed.pathname.replaceAll('/', '');

		if (path) {
			return '@' + path;
		}
	} catch (error) {
		return url;
	}

	return url;
}

function getEmptySlide(text) {
	return `
		<div class="slide-card">
			<div class="slide-image">
				<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:30px;text-align:center;">
					${escapeHtml(text)}
				</div>
			</div>
		</div>
	`;
}

function nl2br(value) {
	return String(value || '').replaceAll('\n', '<br>');
}

function escapeHtml(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function escapeAttr(value) {
	return escapeHtml(value);
}
