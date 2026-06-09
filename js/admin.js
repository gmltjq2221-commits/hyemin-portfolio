// 현재 선택된 게시판 코드
let currentBoardCode = 'FEATURED_IMAGE';

// 현재 선택된 게시판 정보
let currentBoard = null;

// 게시판 이름 매핑
const boardTitleMap = {
	FEATURED_IMAGE: '대표 이미지 관리',
	FEATURED_VIDEO: '대표 동영상 관리',
	IMAGE_ARCHIVE: '이미지 게시판 관리',
	VIDEO_ARCHIVE: '영상 게시판 관리'
};

document.addEventListener('DOMContentLoaded', function () {
	checkLogin();

	const postForm = document.querySelector('#postForm');
	const profileForm = document.querySelector('#profileForm');

	if (postForm) {
		postForm.addEventListener('submit', savePost);
	}

	if (profileForm) {
		profileForm.addEventListener('submit', saveProfile);
	}
});

// 로그인 상태 확인
async function checkLogin() {
	const { data } = await db.auth.getSession();

	if (data.session) {
		showAdmin();
		await loadBoard();
		await loadPosts();
	} else {
		showLogin();
	}
}

// 로그인 화면 표시
function showLogin() {
	document.querySelector('#loginBox').classList.remove('hide');
	document.querySelector('#adminBox').classList.add('hide');
}

// 관리자 화면 표시
function showAdmin() {
	document.querySelector('#loginBox').classList.add('hide');
	document.querySelector('#adminBox').classList.remove('hide');
}

// 관리자 로그인
async function loginAdmin() {
	const email = document.querySelector('#loginEmail').value.trim();
	const password = document.querySelector('#loginPassword').value.trim();

	if (!email || !password) {
		alert('이메일과 비밀번호를 입력해주세요.');
		return;
	}

	const { error } = await db.auth.signInWithPassword({
		email: email,
		password: password
	});

	if (error) {
		console.error(error);
		alert('로그인에 실패했습니다.');
		return;
	}

	showAdmin();
	await loadBoard();
	await loadPosts();
}

// 로그아웃
async function logoutAdmin() {
	await db.auth.signOut();
	showLogin();
}

// 게시판 변경
async function changeBoard(boardCode, button) {
	currentBoardCode = boardCode;
	currentBoard = null;

	document.querySelector('#profileBox').classList.add('hide');
	document.querySelector('#postBox').classList.remove('hide');
	document.querySelector('#listBox').classList.remove('hide');

	setActiveButton(button);

	document.querySelector('#boardTitle').textContent = boardTitleMap[boardCode] || '게시글 관리';

	resetPostForm();

	await loadBoard();
	await loadPosts();
}

// 활성 버튼 표시
function setActiveButton(button) {
	document.querySelectorAll('.tab-menu button').forEach(function (btn) {
		btn.classList.remove('active');
	});

	if (button) {
		button.classList.add('active');
	}
}

// 작가 정보 화면 표시
async function showProfileForm(button) {
	setActiveButton(button);

	document.querySelector('#profileBox').classList.remove('hide');
	document.querySelector('#postBox').classList.add('hide');
	document.querySelector('#listBox').classList.add('hide');

	await loadProfile();
}

// 현재 게시판 정보 조회
async function loadBoard() {
	const { data, error } = await db
		.from('boards')
		.select('*')
		.eq('board_code', currentBoardCode)
		.single();

	if (error) {
		console.error(error);
		alert('게시판 정보를 불러오지 못했습니다.');
		return;
	}

	currentBoard = data;
}

// 게시글 목록 조회
async function loadPosts() {
	if (!currentBoard) {
		return;
	}

	const { data, error } = await db
		.from('posts')
		.select('*')
		.eq('board_id', currentBoard.id)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: false });

	if (error) {
		console.error(error);
		alert('게시글 목록을 불러오지 못했습니다.');
		return;
	}

	const list = document.querySelector('#postList');
	list.innerHTML = '';

	if (!data || data.length === 0) {
		list.innerHTML = '<p>등록된 게시글이 없습니다.</p>';
		return;
	}

	data.forEach(function (post) {
		const row = document.createElement('div');
		row.className = 'list-item';

		row.innerHTML = `
			<strong>${escapeHtml(post.title)}</strong>
			<span>${post.is_visible ? '공개' : '비공개'}</span>
			<span>${post.sort_order}</span>
			<button type="button" onclick="editPost(${post.id})">수정</button>
			<button type="button" class="del" onclick="deletePost(${post.id})">삭제</button>
		`;

		list.appendChild(row);
	});
}

// 게시글 저장
async function savePost(event) {
	event.preventDefault();

	if (!currentBoard) {
		alert('게시판 정보가 없습니다.');
		return;
	}

	const postId = document.querySelector('#postId').value;
	const title = document.querySelector('#title').value.trim();
	const caption = document.querySelector('#caption').value.trim();
	const description = document.querySelector('#description').value.trim();
	const thumbnailUrl = document.querySelector('#thumbnailUrl').value.trim();
	const sortOrder = Number(document.querySelector('#sortOrder').value || 0);
	const isVisible = document.querySelector('#isVisible').checked;

	if (!title) {
		alert('제목을 입력해주세요.');
		return;
	}

	const { data: sessionData } = await db.auth.getSession();

	const postPayload = {
		board_id: currentBoard.id,
		title: title,
		caption: caption,
		description: description,
		thumbnail_url: thumbnailUrl,
		sort_order: sortOrder,
		is_visible: isVisible,
		created_by: sessionData.session ? sessionData.session.user.id : null
	};

	let savedPostId = postId;

	if (postId) {
		const { error } = await db
			.from('posts')
			.update(postPayload)
			.eq('id', postId);

		if (error) {
			console.error(error);
			alert('게시글 수정에 실패했습니다.');
			return;
		}
	} else {
		const { data, error } = await db
			.from('posts')
			.insert(postPayload)
			.select()
			.single();

		if (error) {
			console.error(error);
			alert('게시글 등록에 실패했습니다.');
			return;
		}

		savedPostId = data.id;
	}

	await savePostItems(savedPostId);

	alert('저장되었습니다.');

	resetPostForm();
	await loadPosts();
}

// 게시글 항목 저장
async function savePostItems(postId) {
	const itemBoxes = document.querySelectorAll('.post-item-box');

	// 기존 항목 전체 삭제 후 다시 저장
	const deleteResult = await db
		.from('post_items')
		.delete()
		.eq('post_id', postId);

	if (deleteResult.error) {
		console.error(deleteResult.error);
		alert('기존 항목 삭제에 실패했습니다.');
		return;
	}

	const items = [];

	itemBoxes.forEach(function (box, index) {
		const itemType = currentBoard.board_type;
		const urlInput = box.querySelector('.item-url').value.trim();
		const caption = box.querySelector('.item-caption').value.trim();
		const description = box.querySelector('.item-description').value.trim();
		const sortOrder = Number(box.querySelector('.item-sort-order').value || index + 1);
		const isVisible = box.querySelector('.item-visible').checked;

		if (!urlInput) {
			return;
		}

		const item = {
			post_id: postId,
			item_type: itemType,
			caption: caption,
			description: description,
			sort_order: sortOrder,
			is_visible: isVisible
		};

		if (itemType === 'image') {
			item.image_url = urlInput;
		}

		if (itemType === 'video') {
			item.video_url = urlInput;
			item.youtube_id = getYoutubeId(urlInput);
		}

		items.push(item);
	});

	if (items.length === 0) {
		return;
	}

	const { error } = await db
		.from('post_items')
		.insert(items);

	if (error) {
		console.error(error);
		alert('항목 저장에 실패했습니다.');
	}
}

// 게시글 수정 불러오기
async function editPost(postId) {
	const { data: post, error: postError } = await db
		.from('posts')
		.select('*')
		.eq('id', postId)
		.single();

	if (postError) {
		console.error(postError);
		alert('게시글 정보를 불러오지 못했습니다.');
		return;
	}

	document.querySelector('#postId').value = post.id;
	document.querySelector('#title').value = post.title || '';
	document.querySelector('#caption').value = post.caption || '';
	document.querySelector('#description').value = post.description || '';
	document.querySelector('#thumbnailUrl').value = post.thumbnail_url || '';
	document.querySelector('#sortOrder').value = post.sort_order || 0;
	document.querySelector('#isVisible').checked = post.is_visible;

	const { data: items, error: itemError } = await db
		.from('post_items')
		.select('*')
		.eq('post_id', postId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });

	if (itemError) {
		console.error(itemError);
		alert('게시글 항목을 불러오지 못했습니다.');
		return;
	}

	const wrap = document.querySelector('#postItemsWrap');
	wrap.innerHTML = '';

	items.forEach(function (item) {
		addPostItem(item);
	});

	window.scrollTo({
		top: 0,
		behavior: 'smooth'
	});
}

// 게시글 삭제
async function deletePost(postId) {
	if (!confirm('게시글을 삭제하시겠습니까?')) {
		return;
	}

	const { error } = await db
		.from('posts')
		.delete()
		.eq('id', postId);

	if (error) {
		console.error(error);
		alert('삭제에 실패했습니다.');
		return;
	}

	await loadPosts();
}

// 게시글 항목 추가
function addPostItem(item) {
	const wrap = document.querySelector('#postItemsWrap');
	const box = document.createElement('div');

	const itemType = currentBoard ? currentBoard.board_type : 'image';
	const labelText = itemType === 'video' ? '유튜브 링크' : '이미지 URL';
	const urlValue = itemType === 'video' ? item?.video_url || '' : item?.image_url || '';

	box.className = 'post-item-box';

	box.innerHTML = `
		<div class="form-row">
			<label>${labelText}</label>
			<input type="text" class="item-url" value="${escapeAttr(urlValue)}">
		</div>

		<div class="form-row">
			<label>캡션</label>
			<input type="text" class="item-caption" value="${escapeAttr(item?.caption || '')}">
		</div>

		<div class="form-row">
			<label>상세설명</label>
			<textarea class="item-description">${escapeHtml(item?.description || '')}</textarea>
		</div>

		<div class="form-row">
			<label>노출 순서</label>
			<input type="number" class="item-sort-order" value="${item?.sort_order || ''}">
		</div>

		<div class="form-row">
			<label>
				<input type="checkbox" class="item-visible" ${item?.is_visible === false ? '' : 'checked'}>
				공개
			</label>
		</div>

		<button type="button" class="del" onclick="removePostItem(this)">항목 삭제</button>
	`;

	wrap.appendChild(box);
}

// 게시글 항목 제거
function removePostItem(button) {
	button.closest('.post-item-box').remove();
}

// 게시글 입력 초기화
function resetPostForm() {
	document.querySelector('#postId').value = '';
	document.querySelector('#title').value = '';
	document.querySelector('#caption').value = '';
	document.querySelector('#description').value = '';
	document.querySelector('#thumbnailUrl').value = '';
	document.querySelector('#sortOrder').value = 0;
	document.querySelector('#isVisible').checked = true;
	document.querySelector('#postItemsWrap').innerHTML = '';

	addPostItem();
}

// 작가 정보 조회
async function loadProfile() {
	const { data, error } = await db
		.from('site_profiles')
		.select('*')
		.order('id', { ascending: true })
		.limit(1)
		.single();

	if (error) {
		console.error(error);
		alert('작가 정보를 불러오지 못했습니다.');
		return;
	}

	document.querySelector('#profileId').value = data.id;
	document.querySelector('#artistName').value = data.artist_name || '';
	document.querySelector('#artistTitle').value = data.artist_title || '';
	document.querySelector('#artistMessage').value = data.artist_message || '';
	document.querySelector('#email').value = data.email || '';
	document.querySelector('#instagramUrl').value = data.instagram_url || '';
	document.querySelector('#phone').value = data.phone || '';
	document.querySelector('#profileImageUrl').value = data.profile_image_url || '';
}

// 작가 정보 저장
async function saveProfile(event) {
	event.preventDefault();

	const profileId = document.querySelector('#profileId').value;

	const payload = {
		artist_name: document.querySelector('#artistName').value.trim(),
		artist_title: document.querySelector('#artistTitle').value.trim(),
		artist_message: document.querySelector('#artistMessage').value.trim(),
		email: document.querySelector('#email').value.trim(),
		instagram_url: document.querySelector('#instagramUrl').value.trim(),
		phone: document.querySelector('#phone').value.trim(),
		profile_image_url: document.querySelector('#profileImageUrl').value.trim()
	};

	const { error } = await db
		.from('site_profiles')
		.update(payload)
		.eq('id', profileId);

	if (error) {
		console.error(error);
		alert('작가 정보 저장에 실패했습니다.');
		return;
	}

	alert('작가 정보가 저장되었습니다.');
}

// 유튜브 ID 추출
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

// HTML 출력 보안 처리
function escapeHtml(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

// input value 보안 처리
function escapeAttr(value) {
	return escapeHtml(value);
}
